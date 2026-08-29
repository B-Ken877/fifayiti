// FIFAYITI client-side Instant Replay engine (browser).
//
// THE PROGRAM FEED BUFFER: while the viewer watches the broadcast, a
// MediaRecorder continuously records the exact stream the <video> element
// is playing (the operator-SELECTED camera — camera switches included)
// into a ~15s rolling buffer. On GOL the engine seals the previous
// window and plays:
//
//     LIVE ──▶ [5s clip @1×] ──▶ [same clip @0.5× ≈10s] ──▶ LIVE
//
// Because the buffer records what the viewer's player was actually fed,
// the replay is by construction EXACTLY what the FIFAYITI audience saw
// immediately before the marker — including an on-air camera change in
// those five seconds (the timeline is never reconstructed afterwards).
//
// The live <video> keeps running (hidden, muted) during the replay, so
// the WebRTC track never stalls, the buffer keeps filling, and the
// return to LIVE is an instant visual swap — no rebuffer.
//
// Failure policy: ANY error aborts straight back to live and logs.
// The broadcast must never depend on the replay succeeding.
//
// Serverless/Cloud note: there is no server-reachable recording to cut
// from (egress → object storage; Vercel cannot run ffmpeg), so the
// viewer's own buffer is the fastest, cheapest, most authentic source.

import { planReplay, nextPhase, DEFAULT_REPLAY_WINDOW, type ReplayWindowConfig, type ReplayPhase } from "./replay-sequence";

export interface ReplayMessage {
  type: "instant-replay";
  replayId: string;
  kind: string;
  minute?: number | null;
  preRollMs?: number;
  slowMotionRate?: number;
  transportGuardMs?: number;
}

export interface ReplayEngineState {
  phase: ReplayPhase;
  kind: string | null;
  reason: string | null; // why a trigger was skipped/rejected (debug)
  plan: { clipStart: number; clipEnd: number; normalMs: number; slowMs: number; totalMs: number } | null;
  bufferedSec: number;
  startedAt: number | null;
  /** Client-side DVR (WebRTC path): pause / ±10s / timeline scrubbing. */
  dvr: DvrState;
}

export interface DvrState {
  mode: "live" | "paused" | "dvr";
  /** seconds behind the live edge (0 = at live) */
  behindSec: number;
  /** DVR window size (grows to BUFFER_MS after the broadcast warms up) */
  windowSec: number;
  /** true while a DVR clip is frozen mid-playback */
  clipPaused: boolean;
}

interface Chunk {
  blob: Blob;
  wall: number; // client wall-clock when this 1s slice arrived
}

// 60s rolling window: the instant replay needs ~16s, and the DVR
// (pause / ±10s jumps / timeline scrubbing on the WebRTC path) uses the
// full window. At 2.5 Mbps this is ~19 MB of memory — fine on the
// Haitian mid-range Androids this product targets.
const BUFFER_MS = 60_000;
const TIMESLICE_MS = 1000;

export class ClientReplayEngine {
  private cfg: ReplayWindowConfig;
  private video: HTMLVideoElement | null = null; // the REPLAY <video>
  private liveVideo: HTMLVideoElement | null = null; // the LIVE <video>
  private recorder: MediaRecorder | null = null;
  private chunks: Chunk[] = [];
  /** The webm INIT SEGMENT (EBML header + track info) from the recording's
   *  first data event. Kept FOREVER and prepended to every blob built from
   *  a SLICE of the rolling buffer — without it the demuxer cannot open
   *  the clip (DEMUXER_ERROR_COULD_NOT_OPEN). It must also survive prune()
 *  or even instant replays would break once the buffer rolls past the
   *  first minute. */
  private initChunk: Blob | null = null;
  /** Clean init segment (header only, cluster-stripped) extracted from
   *  initChunk — the raw first chunk usually FUSES the header with the
   *  first cluster, which produces decode errors when prepended to a
   *  later slice. */
  private initSegment: Blob | null = null;
  private objectUrl: string | null = null;
  private seenReplayIds = new Set<string>();
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  private _phase: ReplayPhase = "idle";
  private _kind: string | null = null;
  private _reason: string | null = null;
  private _plan: ReplayEngineState["plan"] = null;
  private _startedAt: number | null = null;

  // ── Client-side DVR state (WebRTC path) ─────────────────────────────
  // "live"   — watching the live edge (normal)
  // "paused" — LIVE element frozen; the recorder keeps filling the
  //            buffer, so behindSec grows while frozen
  // "dvr"    — playing a clip built from the rolling buffer at some
  //            wall-clock position behind live; converges back to the
  //            live edge automatically (auto-return at ≤1.2s behind)
  private _dvrMode: "live" | "paused" | "dvr" = "live";
  private _dvrPausedAt = 0; // wall ms when the live element was frozen
  private _dvrAnchorWall = 0; // wall ms ↔ DVR clip position base
  private _dvrBaseOffset: number | null = null; // clip's first-frame currentTime
  private _dvrSpanSec = 0; // real content span of the current clip (chunk walls)
  private _dvrLastPos = -1; // stall detection (currentTime freeze)
  private _dvrStallSince = 0;
  private dvrTicker: ReturnType<typeof setInterval> | null = null;

  onState: (s: ReplayEngineState) => void = () => {};

  constructor(opts?: { config?: Partial<ReplayWindowConfig>; onState?: (s: ReplayEngineState) => void }) {
    this.cfg = { ...DEFAULT_REPLAY_WINDOW, ...(opts?.config ?? {}) };
    if (opts?.onState) this.onState = opts.onState;
    // Test/debug hook (headless verification + supportability).
    (typeof window !== "undefined" ? (window as any) : {}).__fifayitiReplay = {
      state: () => this.snapshot(),
      history: [] as any[],
    };
  }

  // ── Wiring ──────────────────────────────────────────────────────────
  /** The dedicated (hidden until active) <video> used to play replays. */
  attachReplayVideo(el: HTMLVideoElement | null) {
    this.video = el;
  }
  /** The LIVE WebRTC <video> — kept running (hidden) while a replay plays. */
  attachLiveVideo(el: HTMLVideoElement | null) {
    this.liveVideo = el;
  }

  /**
   * Feed the program stream (the operator-selected camera's track).
   * Called on subscribe AND on every hot camera switch — the recorder
   * restarts seamlessly, chunks accumulate in order, so the buffer
   * preserves the true broadcast timeline across switches.
   */
  setSource(track: MediaStreamTrack | null) {
    // Broadcast going off air / camera change — never leave the viewer
    // stuck on a frozen DVR clip from the previous program.
    if (this._dvrMode !== "live") this.dvrReturnLive();
    this.stopRecorder();
    if (!track || track.readyState === "ended") return;
    if (typeof MediaRecorder === "undefined") {
      this._reason = "MediaRecorder unsupported — replay disabled, live unaffected";
      this.emit();
      return;
    }
    try {
      const stream = new MediaStream([track]);
      const mime = pickMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 2_500_000 });
      rec.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        if (!this.initChunk) {
          // First blob of a recording = init segment (+ maybe first cluster).
          // Hold it out of the rolling timeline; blobs prepend it instead.
          this.initChunk = e.data;
          void this.extractInitSegment(e.data);
          return;
        }
        this.chunks.push({ blob: e.data, wall: Date.now() });
        this.prune();
      };
      rec.onerror = () => { this.stopRecorder(); }; // buffer dies; live unaffected
      rec.start(TIMESLICE_MS);
      this.recorder = rec;
      // Continuous emit while recording — the DVR bar's timeline needs a
      // fresh dvr.windowSec even in plain live-watching mode (the window
      // grows from 0 → 60s after the broadcast starts).
      this.startDvrTicker();
      this._reason = null;
    } catch (e: any) {
      this._reason = `recorder start failed: ${e?.message}`;
      this.recorder = null;
    }
    this.emit();
  }

  // ── Trigger ─────────────────────────────────────────────────────────
  /** A replay event arrived (LiveKit data channel). */
  trigger(msg: ReplayMessage) {
    // Dedupe RELIABLE redeliveries + same-id re-broadcasts.
    if (this.seenReplayIds.has(msg.replayId)) return this.skip(`duplicate ${msg.replayId}`);
    this.seenReplayIds.add(msg.replayId);
    if (this.seenReplayIds.size > 32) this.seenReplayIds.delete(this.seenReplayIds.values().next().value as string);

    // Policy (v1): REJECT while a replay is already playing. The event
    // itself was already recorded server-side — nothing is lost.
    if (this._phase !== "idle" && this._phase !== "returning") {
      return this.skip("busy — replay already playing");
    }
    // DVR pause/scrub also occupies the replay plumbing — one thing at a
    // time; the operator's GOL replay wins next time it fires.
    if (this._dvrMode !== "live") return this.skip("busy — viewer is in DVR");
    if (!this.video) return this.skip("no replay element mounted");
    if (!this.recorder || this.chunks.length === 0) {
      return this.skip("no program buffer (broadcast just started?)");
    }

    // Per-trigger window overrides (future PRE_ROLL/POST_ROLL tuning).
    const cfg: ReplayWindowConfig = {
      ...this.cfg,
      preRollSec: (msg.preRollMs ?? this.cfg.preRollSec * 1000) / 1000,
      slowMotionRate: msg.slowMotionRate ?? this.cfg.slowMotionRate,
      transportGuardSec: (msg.transportGuardMs ?? this.cfg.transportGuardSec * 1000) / 1000,
    };

    this._kind = msg.kind ?? "GOL";
    this.setPhase("arming");

    // Seal what is recorded so far, then plan around its real duration.
    const blob = this.buildBlob(0) ?? new Blob(this.chunks.map((c) => c.blob), { type: this.chunks[0].blob.type });
    if (!blob) return this.skip("no footage to seal");
    const url = URL.createObjectURL(blob);
    this.objectUrl = url;
    const v = this.video;

    const armWatchdog = (ms: number, why: string) => {
      if (this.watchdog) clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => this.abort(why), ms);
    };

    v.src = url;
    const onMeta = async () => {
      v.removeEventListener("loadedmetadata", onMeta);
      // Concatenated MediaRecorder chunks have NO Duration element in the
      // webm header — Chrome reports duration as Infinity/0. Recover the
      // real value with the seek-to-end trick, else fall back to the
      // wall-clock span of the chunks themselves (± the 1s timeslice).
      let available = v.duration;
      if (!isFinite(available) || available <= 0) {
        available = await new Promise<number>((resolve) => {
          const done = () => {
            v.removeEventListener("timeupdate", done);
            clearTimeout(timer);
            resolve(isFinite(v.duration) && v.duration > 0 ? v.duration : 0);
          };
          const timer = setTimeout(done, 1500);
          v.addEventListener("timeupdate", done);
          try { v.currentTime = 1e101; } catch { done(); } // seek past end → duration resolves
        });
      }
      if (!isFinite(available) || available <= 0) available = this.bufferedSec();
      const plan = planReplay(available, cfg);
      if (!plan.ok) { this.releaseUrl(); return this.abort(plan.reason!); }
      this._plan = { clipStart: plan.clipStart, clipEnd: plan.clipEnd, normalMs: plan.normalMs, slowMs: plan.slowMs, totalMs: plan.totalMs };
      this.logHistory("plan", plan);
      this._startedAt = Date.now();

      // LIVE keeps rolling hidden — instant swap back at the end.
      this.hideLive(true);

      const begin = () => {
        v.playbackRate = 1;
        v.currentTime = plan.clipStart;
        this.setPhase("normal");
        // Whole-sequence watchdog: pass durations + generous slack.
        armWatchdog(plan.totalMs + 8000, "watchdog — sequence overran");
        v.play().catch(() => this.abort("replay playback blocked"));
      };
      v.currentTime = plan.clipStart; // prime the seek
      if (v.readyState >= 1) begin();
      else v.addEventListener("loadeddata", begin, { once: true });
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.onerror = () => this.abort("replay video error");
    this.emit();
  }

  // ── Sequence stepping (driven by timeupdate / ended) ────────────────
  /** Call from the replay <video>'s onTimeUpdate handler. */
  onTime() {
    // DVR clip playback — update the behind-live indicator and return
    // to live automatically once the clip has caught the live edge.
    // Two return paths (MediaRecorder blobs carry no duration header, so
    // 'ended' is NOT reliable at the data edge — Chrome can stall there):
    //   1. currentTime reached the buffered end  → clip exhausted → LIVE
    //   2. measured behind-live ≤ 1.2s           → caught the edge → LIVE
    if (this._dvrMode === "dvr") {
      this.emit();
      this.dvrMaybeAutoReturn();
      return;
    }
    if (!this.video || !this._plan) return;
    const t = this.video.currentTime;
    const next = nextPhase(this._phase, t, {
      ok: true, reason: "", clipStart: this._plan.clipStart, clipEnd: this._plan.clipEnd,
      clipSec: 0, normalMs: this._plan.normalMs, slowMs: this._plan.slowMs, totalMs: this._plan.totalMs,
    });
    if (next !== this._phase) this.transition(next);
  }
  /** Call from the replay <video>'s onEnded handler. */
  onEnded() {
    // A DVR clip that ran to its end IS the live edge (the clip was cut
    // at build time) — swap back to the live element.
    if (this._dvrMode === "dvr") { this.dvrReturnLive(); return; }
    if (this._phase === "normal") this.transition("slowmo");
    else if (this._phase === "slowmo") this.transition("returning");
  }

  private transition(next: ReplayPhase) {
    if (next === "slowmo" && this.video && this._plan) {
      const v = this.video;
      v.pause();
      v.playbackRate = this.cfg.slowMotionRate; // true 0.5× playback
      v.currentTime = this._plan.clipStart; // same exact clip again
      this.setPhase("slowmo");
      v.play().catch(() => this.abort("slow-mo playback blocked"));
      return;
    }
    if (next === "returning") this.finish();
  }

  private finish() {
    this.setPhase("returning");
    try { this.video?.pause(); } catch {}
    this.releaseUrl();
    this.hideLive(false); // reveal LIVE (it never stopped playing)
    this._plan = null;
    this._kind = null;
    this._startedAt = null;
    if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null; }
    // Small delay so the UI swap reads as a deliberate broadcast cue.
    setTimeout(() => { this.setPhase("idle"); }, 250);
  }

  private abort(reason: string) {
    this._reason = reason;
    this.logHistory("abort", { reason });
    this.finish();
  }

  private skip(reason: string) {
    this._reason = reason;
    this.logHistory("skip", { reason });
    this.emit();
  }

  private releaseUrl() {
    if (this.objectUrl) {
      const u = this.objectUrl; this.objectUrl = null;
      setTimeout(() => URL.revokeObjectURL(u), 3000);
    }
    if (this.video) { try { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); } catch {} }
  }

  private hideLive(hide: boolean) {
    if (!this.liveVideo) return;
    this.liveVideo.style.visibility = hide ? "hidden" : "visible";
  }

  private setPhase(p: ReplayPhase) {
    if (this._phase === p) return;
    this.logHistory("phase", { phase: p, at: Date.now() });
    this._phase = p;
    this.emit();
  }

  private stopRecorder() {
    if (this.recorder) {
      try { if (this.recorder.state !== "inactive") this.recorder.stop(); } catch {}
      this.recorder.ondataavailable = null;
      this.recorder = null;
    }
    // A new recording (camera switch / re-subscribe) produces a fresh init
    // segment — drop the old one so the next first-chunk captures it.
    this.initChunk = null;
    this.stopDvrTicker();
  }

  /** Split the raw first chunk at the first Matroska Cluster ID
   *  (0x1F43B675) so prepending it yields header + clusters, never a
   *  duplicated/garbled cluster. */
  private async extractInitSegment(raw: Blob) {
    try {
      const head = new Uint8Array(await raw.slice(0, 8192).arrayBuffer());
      for (let i = 0; i + 4 <= head.length; i++) {
        if (head[i] === 0x1f && head[i + 1] === 0x43 && head[i + 2] === 0xb6 && head[i + 3] === 0x75) {
          this.initSegment = i > 0 ? raw.slice(0, i) : raw;
          return;
        }
      }
    } catch {}
    this.initSegment = raw; // no cluster marker found → use as-is
  }

  /** Build a playable blob from a slice of the rolling buffer, always
   *  prepending the webm init segment (headerless clusters won't demux).
   *  NOTE: Blob.slice() DROPS the MIME type — the container type must be
   *  taken from the recorder/chunks or the <video> cannot open the blob. */
  private buildBlob(fromIdx: number): Blob | null {
    if (!this.chunks.length) return null;
    const i = Math.max(0, Math.min(fromIdx, this.chunks.length - 1));
    const init = this.initSegment ?? this.initChunk;
    const parts: Blob[] = [];
    if (init) parts.push(init);
    for (const c of this.chunks.slice(i)) parts.push(c.blob);
    if (parts.length === 0) return null;
    const type = this.chunks[i].blob.type || this.recorder?.mimeType || "video/webm";
    return new Blob(parts, { type });
  }

  private prune() {
    const cutoff = Date.now() - BUFFER_MS;
    while (this.chunks.length > 1 && this.chunks[0].wall < cutoff) this.chunks.shift();
  }

  private bufferedSec(): number {
    if (!this.chunks.length) return 0;
    return (Date.now() - this.chunks[0].wall) / 1000;
  }

  private snapshot(): ReplayEngineState {
    return {
      phase: this._phase, kind: this._kind, reason: this._reason, plan: this._plan,
      bufferedSec: Math.round(this.bufferedSec() * 10) / 10, startedAt: this._startedAt,
      dvr: {
        mode: this._dvrMode,
        behindSec: Math.round(this.behindSec() * 10) / 10,
        windowSec: Math.round(this.dvrWindowSec() * 10) / 10,
        clipPaused: this._dvrMode === "dvr" && !!(this.video && this.video.paused),
      },
    };
  }

  private emit() {
    try { this.onState(this.snapshot()); } catch {}
    // NOTE: window.__fifayitiReplay.state is a live FUNCTION (set in the
    // constructor) — never overwrite it with a snapshot object here.
  }

  private logHistory(kind: string, data: any) {
    const w = (typeof window !== "undefined" ? (window as any) : {}).__fifayitiReplay;
    if (!w) return;
    w.history.push({ kind, ...(typeof data === "object" ? data : { value: data }), wall: Date.now() });
    if (w.history.length > 50) w.history.shift();
  }

  // ══ CLIENT-SIDE DVR (WebRTC path) ═══════════════════════════════════
  // YouTube-style pause / ±10s jumps / timeline scrubbing, backed by the
  // same rolling buffer that powers instant replays. The LIVE element
  // stays attached (hidden) while a DVR clip plays, so returning to live
  // is an instant visual swap — identical to the replay flow.

  /** Freeze the picture. The recorder keeps filling the buffer, so
   *  behindSec grows while frozen (true DVR pause, not a live skip). */
  dvrPause() {
    if (this._dvrMode === "live") {
      if (!this.liveVideo) return;
      try { this.liveVideo.pause(); } catch {}
      this._dvrMode = "paused";
      this._dvrPausedAt = Date.now();
      this.startDvrTicker();
      this.emit();
    } else if (this._dvrMode === "dvr" && this.video) {
      try { this.video.pause(); } catch {}
      this.emit();
    }
  }

  /** Resume. Short freezes (<1.5s) just unpause at live; longer ones
   *  continue from the frozen moment as a DVR clip. */
  dvrPlay() {
    if (this._dvrMode === "paused") {
      const behind = (Date.now() - this._dvrPausedAt) / 1000;
      if (behind < 1.5) { this.dvrReturnLive(); return; }
      this.dvrStartClipAtWall(this._dvrPausedAt);
    } else if (this._dvrMode === "dvr" && this.video) {
      this.video.play().catch(() => {});
      this.emit();
    }
  }

  /** Jump ±seconds: negative = backward (e.g. -10 ↺), positive = toward
   *  live (e.g. +10 ↻). Reaching the edge returns to live automatically. */
  dvrJump(deltaSec: number) {
    const target = this.behindSec() - deltaSec;
    if (target <= 1.2) { this.dvrReturnLive(); return; }
    this.dvrScrubTo(target);
  }

  /** Scrub the timeline to `secBehind` seconds behind the live edge.
   *  STARTUP_COMPENSATION_SEC: building + loading the clip costs ~1-2s,
   *  during which the viewer drifts further behind — aim slightly closer
   *  to live so the LANDED position matches the requested one. */
  dvrScrubTo(secBehind: number) {
    const maxBehind = Math.max(1.2, this.dvrWindowSec() - 1.5);
    const target = Math.min(Math.max(secBehind - 1.2, 0.8), maxBehind);
    if (target <= 1.2) { this.dvrReturnLive(); return; }
    if (!this.recorder || this.chunks.length === 0) return; // no buffer yet
    this.dvrStartClipAtWall(Date.now() - target * 1000);
  }

  /** Auto-return to LIVE when a DVR clip is exhausted. Called from both
   *  onTime and the 800ms ticker (MediaRecorder blobs carry no duration
   *  header — 'ended' is unreliable and currentTime can freeze just
   *  before the buffered edge, so we detect: at-edge, stalled, or caught).
   *  Anything that keeps the clip playing leaves it alone. */
  private dvrMaybeAutoReturn() {
    const v = this.video;
    if (!v || this._dvrMode !== "dvr" || v.seeking) return;

    let atEdge = false;
    if (v.buffered.length > 0) {
      const dataEdge = v.buffered.end(v.buffered.length - 1);
      // dataEdge > 1.5: ignore the pre-roll instants while data loads
      if (dataEdge > 1.5 && v.currentTime >= dataEdge - 0.9) atEdge = true;
    }

    let stalled = false;
    if (Math.abs(v.currentTime - this._dvrLastPos) > 0.05) {
      this._dvrLastPos = v.currentTime;
      this._dvrStallSince = 0;
    } else if (!v.paused) {
      if (!this._dvrStallSince) this._dvrStallSince = Date.now();
      // 3s grace: the decoder may need time to find the first keyframe
      // in the blob before it can start rendering frames. 1.5s was too
      // aggressive and killed clips that were still loading.
      else if (Date.now() - this._dvrStallSince > 3000) stalled = true;
    }

    // Span guard (primary): the clip's REAL content length is known from
    // the chunk wall-clocks — Chrome reports the webm duration as Infinity
    // and can free-run currentTime past the data, so bound it ourselves.
    // NOTE: _dvrSpanSec includes the keyframe lookback padding (~3s), so
    // the clip is exhausted when played time reaches the span minus the
    // lookback (the padding is before the seek point, not after).
    let spanDone = false;
    if (this._dvrBaseOffset != null && this._dvrSpanSec > 0) {
      const played = v.currentTime - this._dvrBaseOffset;
      // Allow the full span (lookback + content) before declaring done —
      // the auto-return on 'caught' (≤1.2s behind live) fires first
      // in normal operation.
      if (played >= this._dvrSpanSec - 0.6) spanDone = true;
    }

    const caught = this._dvrBaseOffset != null && this.behindSec() <= 1.2;
    if (atEdge || stalled || caught || spanDone) this.dvrReturnLive();
  }

  /** Snap back to the live edge (RETOUNEN LIVE). */
  dvrReturnLive() {
    if (this._dvrMode === "live") return;
    try { this.video?.pause(); } catch {}
    this.releaseUrl();
    this.hideLive(false);
    this._dvrMode = "live";
    this._dvrPausedAt = 0;
    this._dvrAnchorWall = 0;
    this._dvrBaseOffset = null;
    this._dvrSpanSec = 0;
    try { this.liveVideo?.play().catch(() => {}); } catch {}
    this.emit();
  }

  /** Seconds behind the live edge (0 = at live). */
  private behindSec(): number {
    if (this._dvrMode === "paused") {
      return Math.max(0, (Date.now() - this._dvrPausedAt) / 1000);
    }
    if (this._dvrMode === "dvr" && this.video) {
      // Blob timecodes are ABSOLUTE (recording-relative), so the clip's
      // first frame sits at currentTime = base, not 0. Anchor accordingly.
      const base = this._dvrBaseOffset ?? this.video.currentTime;
      const anchor = this._dvrAnchorWall + (this.video.currentTime - base) * 1000;
      return Math.max(0, (Date.now() - anchor) / 1000);
    }
    return 0;
  }

  /** Usable DVR window (grows from 0 to BUFFER_MS as the buffer fills). */
  private dvrWindowSec(): number {
    return Math.min(BUFFER_MS / 1000, this.bufferedSec());
  }

  /** Build + play a clip of the rolling buffer starting at wall-clock
   *  `wallMs`. The clip plays 1× and converges to the live edge, where
   *  onTime()/onEnded() auto-return to live.
   *
   *  KEYFRAME LOOKBACK: MediaRecorder produces keyframes only every ~2-3s.
   *  Slicing the buffer at an arbitrary chunk yields a blob whose first
   *  frames are P-frames with no reference — the decoder shows one frame
   *  then stalls. We include KEYFRAME_LOOKBACK extra chunks BEFORE the
   *  requested position so a keyframe is always available, then seek to
   *  the true requested position once the blob has loaded. */
  private dvrStartClipAtWall(wallMs: number) {
    if (!this.video || this.chunks.length === 0) return;
    // Find the chunk at the requested position.
    let targetIdx = this.chunks.findIndex((c) => c.wall >= wallMs - TIMESLICE_MS);
    if (targetIdx < 0) targetIdx = 0;

    // Start a few chunks earlier to guarantee a keyframe is included.
    // MediaRecorder keyframe interval is ~2s at 1s timeslice → 3 chunks
    // of lookback reliably captures at least one keyframe.
    const KEYFRAME_LOOKBACK = 3;
    const startIdx = Math.max(0, targetIdx - KEYFRAME_LOOKBACK);
    const startWall = this.chunks[startIdx].wall - TIMESLICE_MS; // media pos 0 ≈ this wall ms

    // The seek target inside the blob (recording-relative time offset from
    // the blob's first frame to the user's requested position).
    const seekOffsetSec = Math.max(0, (wallMs - startWall) / 1000);

    this.releaseUrl();
    const blob = this.buildBlob(startIdx);
    if (!blob) { this.dvrReturnLive(); return; }
    this._dvrLastPos = -1;
    this._dvrStallSince = 0;
    // Real content span: from the clip's first chunk to the newest chunk
    // at build time (the blob cannot contain more than this).
    this._dvrSpanSec =
      (this.chunks[this.chunks.length - 1].wall - startWall) / 1000 + 1;
    this.objectUrl = URL.createObjectURL(blob);
    const v = this.video;
    this._dvrBaseOffset = null; // measured once playback begins
    v.src = this.objectUrl;
    v.onerror = () => {
      console.warn("[dvr] clip video error:", v.error?.code, v.error?.message);
      this.dvrReturnLive();
    };
    // Anchor at the REQUESTED position (not the blob start) so behindSec()
    // measures from where the user asked to scrub, not from the keyframe
    // lookback padding.
    this._dvrAnchorWall = wallMs;
    this._dvrMode = "dvr";
    this.hideLive(true);
    this.startDvrTicker();
    const go = () => {
      v.playbackRate = 1;
      // Seek past the keyframe lookback to the actual requested position.
      // The decoder has already found the keyframe during loading, so it
      // can decode all P-frames from here forward.
      if (seekOffsetSec > 0.3) {
        try { v.currentTime = seekOffsetSec; } catch {}
      }
      v.play().then(() => {
        // Blob timecodes are absolute — record where playback actually
        // landed (after the seek) so behindSec() is accurate.
        this._dvrBaseOffset = v.currentTime || 0;
        // Adjust the base offset so that behindSec() computes from the
        // requested scrub position, not the post-seek currentTime.
        // behindSec = (now - (anchor + (currentTime - baseOffset)*1000)) / 1000
        // We want behindSec ≈ (now - wallMs) / 1000 at scrub time.
        // anchor = wallMs, so baseOffset must equal currentTime.
        this._dvrBaseOffset = v.currentTime || 0;
      }).catch((reason) => {
        console.warn("[dvr] clip playback rejected:", reason?.name, reason?.message);
        this.dvrReturnLive();
      });
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadeddata", go, { once: true });
    this.emit();
  }

  /** Emit periodically while the program buffer is recording: keeps the
   *  DVR bar's behind-live indicator ticking AND windowSec fresh in live
   *  mode (cheap — one small state object per tick). */
  private startDvrTicker() {
    if (this.dvrTicker) return;
    this.dvrTicker = setInterval(() => {
      // Nothing recording and back at live → nothing left to update.
      if (!this.recorder && this._dvrMode === "live") { this.stopDvrTicker(); return; }
      if (this._dvrMode === "dvr") this.dvrMaybeAutoReturn();
      this.emit();
    }, 800);
  }

  private stopDvrTicker() {
    if (this.dvrTicker) { clearInterval(this.dvrTicker); this.dvrTicker = null; }
  }

  destroy() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.stopDvrTicker();
    this.dvrReturnLive();
    this.releaseUrl();
    this.stopRecorder();
    this.chunks = [];
    this.hideLive(false);
  }
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((c) => { try { return MediaRecorder.isTypeSupported(c); } catch { return false; } });
}
