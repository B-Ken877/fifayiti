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
}

interface Chunk {
  blob: Blob;
  wall: number; // client wall-clock when this 1s slice arrived
}

const BUFFER_MS = 15_000; // rolling window kept in memory (5s + margins)
const TIMESLICE_MS = 1000;

export class ClientReplayEngine {
  private cfg: ReplayWindowConfig;
  private video: HTMLVideoElement | null = null; // the REPLAY <video>
  private liveVideo: HTMLVideoElement | null = null; // the LIVE <video>
  private recorder: MediaRecorder | null = null;
  private chunks: Chunk[] = [];
  private objectUrl: string | null = null;
  private seenReplayIds = new Set<string>();
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  private _phase: ReplayPhase = "idle";
  private _kind: string | null = null;
  private _reason: string | null = null;
  private _plan: ReplayEngineState["plan"] = null;
  private _startedAt: number | null = null;

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
        if (e.data && e.data.size > 0) this.chunks.push({ blob: e.data, wall: Date.now() });
        this.prune();
      };
      rec.onerror = () => { this.stopRecorder(); }; // buffer dies; live unaffected
      rec.start(TIMESLICE_MS);
      this.recorder = rec;
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
    const blob = new Blob(this.chunks.map((c) => c.blob), { type: this.chunks[0].blob.type });
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

  destroy() {
    if (this.watchdog) clearTimeout(this.watchdog);
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
