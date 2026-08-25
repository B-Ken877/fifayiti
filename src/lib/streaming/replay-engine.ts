// FIFAYITI Instant Replay Engine (Task 17).
//
// Turns an operator event (GOL today; cards/saves tomorrow) into an
// automatic BROADCAST REPLAY using the existing HLS/DVR recording:
//
//   operator presses GOL (wall time T, server-captured)
//        ↓
//   wait for the HLS pipeline to flush segments covering T (~3s)
//        ↓
//   map T to the HLS media timeline via PROGRAM-DATE-TIME
//        ↓
//   extract [T-5s, T] from the ON-AIR broadcast recording
//        ↓
//   pass 1: 5s clip, normal speed
//   pass 2: same clip, setpts=2*PTS @ 30fps CFR → true 0.5× slow motion
//        ↓
//   package both as one VOD HLS playlist (~15s)
//        ↓
//   publish broadcast-replay state → viewers at the live edge auto-switch,
//   watch 5s normal + 10s slow-mo, then return to LIVE automatically.
//
// PRINCIPLE: the live broadcast NEVER depends on this succeeding. Every
// step is wrapped; on failure we log and leave the live stream untouched.
//
// Storage: /var/www/fifayiti/replays/<id>/ (persistent — outside the raw
// HLS session folders, which the retention cron cleans after 7 days).
// Each goal costs ~5MB (15s @ ~2.5Mbps).

import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = (() => {
  const cwd = process.cwd();
  return cwd.endsWith(path.join(".next", "standalone"))
    ? path.resolve(cwd, "..", "..")
    : cwd;
})();

const HLS_ROOT = "/var/www/fifayiti/hls";
const REPLAYS_ROOT = "/var/www/fifayiti/replays";
const REPLAY_STATE_FILE = path.join(PROJECT_ROOT, "db", "replay-broadcast.json");
const HLS_STATE_FILE = path.join(PROJECT_ROOT, "db", "hls-state.json");

// ── v1 replay window (per spec: exactly 5s before the marker, no post-roll).
//    Configurable for the future (PRE_ROLL/POST_ROLL) without redesign.
export interface ReplayWindow {
  preRollMs: number;
  postRollMs: number; // v1: 0 — the marker is the end of the window
  slowMotionRate: number; // 0.5× — footage plays at half speed
}
const DEFAULT_WINDOW: ReplayWindow = { preRollMs: 5000, postRollMs: 0, slowMotionRate: 0.5 };

// Event kinds that trigger a broadcast replay. Extendable tomorrow:
// KAT_WOUJ, KAT_JON, SAV, BIG_CHANCE …
const REPLAY_KINDS: string[] = ["GOL", "FOT", "KAT_JON", "KAT_WOUJ"];

// In-process lock so rapid consecutive triggers can't corrupt each other.
let replayInFlight = false;

export interface ReplayTrigger {
  kind: string; // "GOL"
  matchId?: string;
  eventId?: string;
  teamId?: string | null;
  playerInId?: string | null;
  description?: string;
  minute?: number;
}

export interface BroadcastReplayState {
  active: boolean;
  url: string | null; // public URL of the replay playlist
  kind: string | null;
  replayId: string | null;
  startedAt: number | null;
  endsAt: number | null; // safety net — players also return on 'ended'
  durationMs: number | null;
}

// ────────────────────────────────────────────────────────────────────────
// HLS playlist parsing — the wall-clock ↔ media-timeline mapping.
// The EVENT playlist carries PROGRAM-DATE-TIME per segment; PDT tracks the
// real time the content was captured, so:
//     mediaPdt = wallClock   (± <200ms segmenter drift)
// The mapping is therefore direct — we locate the segment whose PDT range
// contains the target wall time and convert to a media offset.
// ────────────────────────────────────────────────────────────────────────
interface PlaylistSegment {
  pdt: number; // epoch ms
  duration: number; // seconds
  file: string; // absolute path
}

async function parsePlaylist(sessionFolder: string): Promise<PlaylistSegment[]> {
  const playlistPath = path.join(sessionFolder, "index.m3u8");
  const text = await readFile(playlistPath, "utf-8");
  const segments: PlaylistSegment[] = [];
  let pendingPdt: number | null = null;
  let pendingDuration = 1.0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      pendingPdt = new Date(t.slice("#EXT-X-PROGRAM-DATE-TIME:".length)).getTime();
    } else if (t.startsWith("#EXTINF:")) {
      pendingDuration = parseFloat(t.slice("#EXTINF:".length).replace(",", ""));
    } else if (t && !t.startsWith("#")) {
      if (pendingPdt != null) {
        segments.push({ pdt: pendingPdt, duration: pendingDuration, file: path.join(sessionFolder, t) });
      }
      pendingPdt = null; // only trust PDT-tagged entries (all of ours are)
    }
  }
  return segments;
}

/** Wait until the recording covers `targetPdt` (egress lag ~3s), max `maxWaitMs`. */
async function waitForFlush(
  segments: PlaylistSegment[],
  targetPdt: number,
  maxWaitMs: number
): Promise<PlaylistSegment[]> {
  const deadline = Date.now() + maxWaitMs;
  let current = segments;
  while (Date.now() < deadline) {
    const last = current[current.length - 1];
    if (last && last.pdt + last.duration * 1000 >= targetPdt) return current;
    await new Promise((r) => setTimeout(r, 400));
    const sessionFolder = path.dirname(last?.file ?? "");
    if (existsSync(path.join(sessionFolder, "index.m3u8"))) {
      try {
        current = await parsePlaylist(sessionFolder);
      } catch {}
    }
  }
  return current;
}

// ────────────────────────────────────────────────────────────────────────
// ffmpeg helpers
// ────────────────────────────────────────────────────────────────────────
async function ffprobeHasAudio(file: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file],
      { timeout: 15000 }
    );
    return stdout.includes("audio");
  } catch {
    return false;
  }
}

async function ffprobeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { timeout: 15000 }
    );
    return parseFloat(stdout.trim());
  } catch {
    return 0;
  }
}

// ────────────────────────────────────────────────────────────────────────
// The replay engine
// ────────────────────────────────────────────────────────────────────────
export async function triggerBroadcastReplay(
  trigger: ReplayTrigger,
  windowConfig: ReplayWindow = DEFAULT_WINDOW
): Promise<{ ok: boolean; reason?: string; replayId?: string; url?: string }> {
  if (!REPLAY_KINDS.includes(trigger.kind)) {
    return { ok: false, reason: `kind ${trigger.kind} does not trigger replay` };
  }
  if (replayInFlight) {
    // Policy (v1): safely REJECT a second replay while one is running.
    // The GOL event itself is already recorded — only the replay is skipped.
    console.log("[replay-engine] busy — trigger rejected (kind=" + trigger.kind + ")");
    return { ok: false, reason: "replay already in progress" };
  }

  // Also honor a still-active broadcast state from a previous process.
  const existing = await readBroadcastState();
  if (existing?.active && existing.endsAt && existing.endsAt > Date.now()) {
    console.log("[replay-engine] broadcast replay state still active — trigger rejected");
    return { ok: false, reason: "replay already in progress" };
  }

  replayInFlight = true;
  try {
    return await runReplay(trigger, windowConfig);
  } catch (e: any) {
    console.error("[replay-engine] FAILED — live broadcast continues:", e?.message ?? e);
    // Never leave a half-published state behind.
    await clearBroadcastState().catch(() => {});
    return { ok: false, reason: e?.message ?? "replay generation failed" };
  } finally {
    replayInFlight = false;
  }
}

async function runReplay(trigger: ReplayTrigger, cfg: ReplayWindow) {
  // ── 1. Locate the active HLS session ────────────────────────────────
  let sessionFolder: string | null = null;
  try {
    const st = JSON.parse(await readFile(HLS_STATE_FILE, "utf-8"));
    if (st?.folder && existsSync(path.join(st.folder, "index.m3u8"))) {
      sessionFolder = st.folder;
    }
  } catch {}
  if (!sessionFolder) {
    // e.g. GOL pressed seconds after the broadcast started (playlist not
    // yet written) or with no broadcast at all — fail gracefully, the
    // event itself is already recorded.
    console.log("[replay-engine] no active HLS recording — replay skipped");
    return { ok: false, reason: "no active HLS recording session" };
  }

  // ── 2. Capture the event wall-time, then wait for flush ─────────────
  const markerWall = Date.now();
  const windowEndPdt = markerWall - cfg.postRollMs;
  const windowStartPdt = markerWall - cfg.preRollMs - cfg.postRollMs;

  let segments = await parsePlaylist(sessionFolder);
  if (segments.length === 0) {
    return { ok: false, reason: "empty HLS playlist" };
  }
  segments = await waitForFlush(segments, windowEndPdt, 8000);

  const first = segments[0];
  const last = segments[segments.length - 1];
  const availableStart = first.pdt;
  const availableEnd = last.pdt + last.duration * 1000;

  // ── 3. Clamp the window to what was actually recorded ───────────────
  let startPdt = Math.max(windowStartPdt, availableStart);
  let endPdt = Math.min(windowEndPdt, availableEnd);
  if (endPdt - startPdt < 2000) {
    // Broadcast started moments ago — not enough footage for a meaningful
    // replay. Fail gracefully; the live stream is untouched.
    console.log("[replay-engine] not enough recorded footage — replay skipped");
    return { ok: false, reason: "not enough footage" };
  }
  const clipSeconds = (endPdt - startPdt) / 1000;

  // ── 4. Build the ffmpeg concat input (only the segments we need) ────
  const needed = segments.filter((s) => s.pdt + s.duration * 1000 > startPdt && s.pdt < endPdt);
  if (needed.length === 0) {
    return { ok: false, reason: "no segments in window" };
  }
  // Input seek offset inside the first needed segment:
  const seekOffset = Math.max(0, (startPdt - needed[0].pdt) / 1000);

  const replayId = `${trigger.kind.toLowerCase()}-${Date.now()}`;
  const outDir = path.join(REPLAYS_ROOT, replayId);
  await mkdir(outDir, { recursive: true });

  const listFile = path.join(outDir, "source-list.txt");
  await writeFile(listFile, needed.map((s) => `file '${s.file}'`).join("\n") + "\n");

  const normalFile = path.join(outDir, "normal.mp4");
  const slowFile = path.join(outDir, "slowmo.mp4");
  const hasAudio = await ffprobeHasAudio(needed[0].file);

  // ── 5. Pass 1 — extract the window at normal speed ──────────────────
  const normalArgs = [
    "-y", "-loglevel", "error",
    "-ss", seekOffset.toFixed(3),
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-t", clipSeconds.toFixed(3),
    "-vf", "setpts=PTS-STARTPTS",
  ];
  if (hasAudio) normalArgs.push("-af", "asetpts=PTS-STARTPTS");
  normalArgs.push(
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-b:v", "2500k", "-maxrate", "2600k", "-bufsize", "5000k",
  );
  if (hasAudio) normalArgs.push("-c:a", "aac", "-b:a", "128k", "-ar", "44100");
  else normalArgs.push("-an");
  normalArgs.push(normalFile);
  await execFileAsync("ffmpeg", normalArgs, { timeout: 60000 });

  // ── 6. Pass 2 — the SAME clip at true 0.5× slow motion ──────────────
  // setpts=2*PTS halves playback speed; -r 30 keeps a constant 30fps CFR
  // timeline by doubling each frame — smooth broadcast-style slow motion
  // from our 30fps source (no slideshow, no UI stretching).
  const slowFactor = 1 / cfg.slowMotionRate; // 2.0 for 0.5×
  const slowArgs = [
    "-y", "-loglevel", "error",
    "-i", normalFile,
  ];
  if (hasAudio) {
    slowArgs.push(
      "-filter_complex",
      `[0:v]setpts=${slowFactor}*PTS[v];[0:a]atempo=${cfg.slowMotionRate}[a]`,
      "-map", "[v]", "-map", "[a]",
    );
  } else {
    slowArgs.push("-vf", `setpts=${slowFactor}*PTS`, "-map", "0:v");
  }
  slowArgs.push(
    "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-b:v", "2500k", "-maxrate", "2600k", "-bufsize", "5000k",
  );
  if (hasAudio) slowArgs.push("-c:a", "aac", "-b:a", "128k", "-ar", "44100");
  else slowArgs.push("-an");
  slowArgs.push(slowFile);
  await execFileAsync("ffmpeg", slowArgs, { timeout: 60000 });

  // ── 7. Pass 3 — package [normal | slow-mo] as one VOD HLS playlist ──
  const concatFile = path.join(outDir, "inputs.txt");
  await writeFile(concatFile, `file '${normalFile}'\nfile '${slowFile}'\n`);
  const playlistFile = path.join(outDir, "replay.m3u8");
  const pkgArgs = [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", concatFile,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-b:v", "2500k", "-maxrate", "2600k", "-bufsize", "5000k",
  ];
  if (hasAudio) pkgArgs.push("-c:a", "aac", "-b:a", "128k", "-ar", "44100");
  else pkgArgs.push("-an");
  pkgArgs.push(
    "-f", "hls",
    "-hls_time", "1",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", path.join(outDir, "seg_%04d.ts"),
    playlistFile,
  );
  await execFileAsync("ffmpeg", pkgArgs, { timeout: 90000 });

  const totalDuration = await ffprobeDuration(normalFile) + await ffprobeDuration(slowFile);
  if (!totalDuration || totalDuration < 3) {
    throw new Error(`implausible replay duration: ${totalDuration}`);
  }

  // ── 8. Archive record (match / team / player / media reference) ─────
  const meta = {
    id: replayId,
    kind: trigger.kind,
    matchId: trigger.matchId ?? null,
    eventId: trigger.eventId ?? null,
    teamId: trigger.teamId ?? null,
    playerInId: trigger.playerInId ?? null,
    description: trigger.description ?? "",
    minute: trigger.minute ?? null,
    wallTime: markerWall,
    mediaStartPdt: startPdt,
    mediaEndPdt: endPdt,
    sourceSession: path.basename(sessionFolder),
    url: `/replays/${replayId}/replay.m3u8`,
    durationMs: Math.round(totalDuration * 1000),
    slowMotionRate: cfg.slowMotionRate,
    createdAt: new Date().toISOString(),
  };
  await writeFile(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

  // ── 9. Publish the broadcast replay for live-edge viewers ───────────
  const endsAt = Date.now() + meta.durationMs + 4000; // safety margin
  const state: BroadcastReplayState = {
    active: true,
    url: meta.url,
    kind: meta.kind,
    replayId: meta.id,
    startedAt: Date.now(),
    endsAt,
    durationMs: meta.durationMs,
  };
  await writeBroadcastState(state);
  console.log(
    `[replay-engine] BROADCAST REPLAY live: ${meta.url} ` +
    `(${clipSeconds.toFixed(1)}s normal + ${(clipSeconds / cfg.slowMotionRate).toFixed(1)}s slow-mo = ${(totalDuration).toFixed(1)}s)`
  );

  return { ok: true, replayId: meta.id, url: meta.url };
}

// ────────────────────────────────────────────────────────────────────────
// Broadcast replay state (viewer-facing)
// ────────────────────────────────────────────────────────────────────────
export async function readBroadcastState(): Promise<BroadcastReplayState> {
  try {
    const raw = JSON.parse(await readFile(REPLAY_STATE_FILE, "utf-8"));
    if (raw?.active && raw.endsAt && Date.now() > raw.endsAt) {
      // Lazily clear expired state (survives restarts).
      await clearBroadcastState();
      return { active: false, url: null, kind: null, replayId: null, startedAt: null, endsAt: null, durationMs: null };
    }
    return raw ?? inactive();
  } catch {
    return inactive();
  }
}

async function writeBroadcastState(s: BroadcastReplayState): Promise<void> {
  const dir = path.dirname(REPLAY_STATE_FILE);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(REPLAY_STATE_FILE, JSON.stringify(s, null, 2));
}

async function clearBroadcastState(): Promise<void> {
  try {
    await writeBroadcastState(inactive());
  } catch {}
}

function inactive(): BroadcastReplayState {
  return { active: false, url: null, kind: null, replayId: null, startedAt: null, endsAt: null, durationMs: null };
}

// ────────────────────────────────────────────────────────────────────────
// Replay archive (for the match's Replay section later)
// ────────────────────────────────────────────────────────────────────────
export async function listReplays(matchId?: string): Promise<any[]> {
  if (!existsSync(REPLAYS_ROOT)) return [];
  const out: any[] = [];
  const dirs = await readdir(REPLAYS_ROOT).catch(() => [] as string[]);
  for (const d of dirs) {
    try {
      const metaPath = path.join(REPLAYS_ROOT, d, "meta.json");
      if (!existsSync(metaPath)) continue;
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      if (!matchId || meta.matchId === matchId) out.push(meta);
    } catch {}
  }
  out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return out;
}
