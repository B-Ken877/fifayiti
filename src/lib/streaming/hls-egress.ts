// HLS/DVR egress lifecycle for FIFAYITI TV.
//
// Architecture (Task 15):
//   camera ──WebRTC──▶ livekit-server ──▶ egress (chrome custom template
//   that follows the operator's selectedSlot) ──▶ H.264/AAC fMP4 segments
//   + EVENT playlist (grows for the whole match = DVR + future full-match
//   replay) + LIVE sliding playlist ──▶ nginx /hls/ ──▶ hls.js player.
//
// The egress lifecycle is driven by the broadcast state:
//   • operator puts a camera on air  (selectedSlot != null) → ensure running
//   • broadcast goes off             (selectedSlot == null) → stop
//
// State (egressId + folder + url) is persisted to db/hls-state.json so a
// Next.js restart can re-attach to a running egress.

import { EgressClient } from "livekit-server-sdk";
import { readFile, writeFile, mkdir, chmod } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const API_KEY = "medikakey";
const API_SECRET = "7GD6FdL2cP9KTmTLkJVUKNj7XfJjWAMS";
const LIVEKIT_URL = "http://127.0.0.1:7880";
const ROOM_NAME = "fifayiti-broadcast";

// Local disk layout: /var/www/fifayiti/hls/<startedAt-ms>/index.m3u8
// (bind-mounted into the medika-egress container at the same path; nginx
// serves /hls/ → that dir). One folder per broadcast session — each folder
// is a complete match recording once the egress finalizes (future VOD).
const HLS_ROOT = "/var/www/fifayiti/hls";
const PUBLIC_HLS_BASE = "/hls";

// The recording template served by this Next.js app. Egress's headless
// chrome fetches it (any path suffix works — see the catch-all route).
const TEMPLATE_BASE_URL = "http://127.0.0.1:4050/egress-template";

// ~2.5 Mbps @ 720p30 — good quality that fits Haitian mobile networks and
// keeps disk usage ~1.1 GB/hour.
const VIDEO_BITRATE = 2_500_000;
const AUDIO_BITRATE = 128_000;
const SEGMENT_DURATION = 1; // seconds — with 1.2s live sync this keeps glass-to-glass ~3s

const cwd = process.cwd();
const PROJECT_ROOT = cwd.endsWith(path.join(".next", "standalone"))
  ? path.resolve(cwd, "..", "..")
  : cwd;
const STATE_FILE = path.join(PROJECT_ROOT, "db", "hls-state.json");

export interface HlsState {
  egressId: string;
  folder: string; // absolute disk folder
  playlistUrl: string; // public URL path (/hls/<ts>/index.m3u8)
  startedAt: number;
}

function egressClient(): EgressClient {
  return new EgressClient(LIVEKIT_URL, API_KEY, API_SECRET);
}

async function readState(): Promise<HlsState | null> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw) ?? null;
  } catch {
    return null;
  }
}

async function writeState(s: HlsState): Promise<void> {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e: any) {
    console.warn("[hls-egress] could not persist state:", e?.message);
  }
}

/** Find OUR active room-composite egress for the broadcast room (if any). */
async function findActiveEgress(): Promise<any | null> {
  const ec = egressClient();
  const list = await ec.listEgress({ roomName: ROOM_NAME, active: true });
  return list.length > 0 ? list[0] : null;
}

/**
 * Make sure an HLS egress is running for the broadcast. Idempotent:
 * if one is already active (or the persisted state matches a live egress),
 * it is reused. Returns the public playlist URL path.
 */
export async function ensureHlsEgress(): Promise<HlsState> {
  // (called directly by /api/livekit-room POST and by the self-healing
  //  ensureOnce() wrapper — both idempotent)
  // 1. Already running?
  const active = await findActiveEgress().catch(() => null);
  if (active) {
    const existing = await readState();
    if (existing && existing.egressId === active.egressId) return existing;
    // Running but unknown to us (e.g. app restarted mid-match) — re-adopt.
    const folder = existing?.folder ?? path.join(HLS_ROOT, String(Date.now()));
    const st: HlsState = {
      egressId: active.egressId,
      folder,
      playlistUrl: existing?.playlistUrl ?? `${PUBLIC_HLS_BASE}/${path.basename(folder)}/index.m3u8`,
      startedAt: Number(active.startedAt ?? BigInt(Date.now() * 1e6)) / 1e6 || Date.now(),
    };
    await writeState(st);
    return st;
  }

  // 2. Start a new one. Unique folder per broadcast session.
  const folderName = String(Date.now());
  const folder = path.join(HLS_ROOT, folderName);
  if (!existsSync(folder)) await mkdir(folder, { recursive: true });
  // The egress container runs as uid 1001 (user "egress") — it must be able
  // to write segments into the session folder our API (running as root)
  // created inside /var/www/fifayiti/hls.
  try { await chmod(folder, 0o777); } catch {}

  const ec = egressClient();
  const info = await ec.startRoomCompositeEgress(
    ROOM_NAME,
    {
      // SegmentedFileOutput (HLS). Enums: HLS_PROTOCOL=1, suffix INDEX=0.
      protocol: 1,
      filenamePrefix: folder + "/",
      playlistName: "index.m3u8", // EVENT playlist — full match, DVR/VOD
      livePlaylistName: "live.m3u8", // sliding live window (strict-LL clients)
      segmentDuration: SEGMENT_DURATION,
      disableManifest: true,
    },
    {
      layout: "tv",
      customBaseUrl: TEMPLATE_BASE_URL,
      encodingOptions: {
        width: 1280,
        height: 720,
        framerate: 30,
        videoBitrate: VIDEO_BITRATE,
        audioBitrate: AUDIO_BITRATE,
        audioCodec: 2, // AAC
        videoCodec: 2, // H264_MAIN
      },
    }
  );

  const st: HlsState = {
    egressId: info.egressId,
    folder,
    playlistUrl: `${PUBLIC_HLS_BASE}/${folderName}/index.m3u8`,
    startedAt: Date.now(),
  };
  await writeState(st);
  console.log("[hls-egress] started:", st.egressId, "→", st.playlistUrl);
  return st;
}

/** Stop the active HLS egress (finalizes the playlist with #EXT-X-ENDLIST). */
export async function stopHlsEgress(): Promise<void> {
  const active = await findActiveEgress().catch(() => null);
  if (active) {
    try {
      await egressClient().stopEgress(active.egressId);
      console.log("[hls-egress] stopped:", active.egressId);
    } catch (e: any) {
      console.warn("[hls-egress] stop failed:", e?.message);
    }
  }
}

// Dedupes concurrent ensure attempts (viewer polls arrive every ~5s).
let ensureInFlight: Promise<HlsState> | null = null;
async function ensureOnce(): Promise<HlsState> {
  if (!ensureInFlight) {
    ensureInFlight = ensureHlsEgress().finally(() => {
      ensureInFlight = null;
    });
  }
  return ensureInFlight;
}

async function broadcastIsOn(): Promise<boolean> {
  try {
    const raw = await readFile(
      path.join(PROJECT_ROOT, "db", "broadcast-state.json"),
      "utf-8"
    );
    const parsed = JSON.parse(raw);
    return parsed?.metadata?.selectedSlot != null;
  } catch {
    return false;
  }
}

/**
 * Viewer-facing status. `ready` means the playlist file already exists on
 * disk (egress chrome booted + first segments written) — the player can
 * switch from the WebRTC fallback to HLS.
 *
 * SELF-HEALING: if the broadcast is on but the egress died (app restart
 * raced the chrome page load, container restart, crash), the viewer polls
 * that hit this endpoint restart it automatically. This keeps the DVR
 * pipeline running without operator intervention.
 */
export async function getHlsStatus(): Promise<{
  active: boolean;
  ready: boolean;
  url: string | null;
}> {
  const st = await readState();
  let active = st ? await findActiveEgress().catch(() => null) : null;

  // ── Self-healing: broadcast on + egress dead/missing → restart it ──
  if (!active && (await broadcastIsOn())) {
    try {
      const healed = await ensureOnce();
      if (healed) active = await findActiveEgress().catch(() => null);
    } catch (e: any) {
      console.warn("[hls-egress] self-heal failed:", e?.message);
    }
  }

  if (!st || !active) return { active: false, ready: false, url: null };

  // The running egress may differ from the state file (adopted/restarted).
  const url = active.egressId === st.egressId
    ? st.playlistUrl
    : st.playlistUrl; // folder is recreated per session; egressId mismatch
                      // after adoption still uses the same persisted folder
  const ready = existsSync(path.join(st.folder, "index.m3u8"));
  return { active: true, ready, url };
}
