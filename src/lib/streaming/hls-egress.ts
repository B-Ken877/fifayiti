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
// An egress is considered a ZOMBIE when it is listed active but its
// handler process is gone (egress container restart leaves the Redis entry
// pointing at a dead node — stopEgress on it times out and it blocks all
// future broadcasts). Symptom: active for a while + no playlist file.
const ZOMBIE_AFTER_MS = 90_000;

async function isHealthyEgress(active: any, folder: string | null): Promise<boolean> {
  // Fresh (< 90s old): give chrome time to boot and write the playlist.
  const startedMs =
    Number(active?.startedAt ?? BigInt(0)) > 1e15
      ? Number(active.startedAt) / 1e6
      : Number(active?.startedAt ?? 0) * 1000;
  if (Date.now() - startedMs < ZOMBIE_AFTER_MS) return true;
  // Older: healthy only if its playlist file exists on disk.
  if (!folder) return false;
  return existsSync(path.join(folder, "index.m3u8"));
}

async function killZombie(egressId: string): Promise<void> {
  try {
    await Promise.race([
      egressClient().stopEgress(egressId),
      new Promise((r) => setTimeout(r, 8000)), // stop on a zombie times out
    ]);
  } catch {}
  console.warn("[hls-egress] zombie egress detected, force-cleared:", egressId);
}

export async function ensureHlsEgress(): Promise<HlsState> {
  // (called directly by /api/livekit-room POST and by the self-healing
  //  ensureOnce() wrapper — both idempotent)
  // 1. Already running — and actually healthy?
  let active = await findActiveEgress().catch(() => null);
  if (active) {
    const existing = await readState();
    const folder = existing?.egressId === active.egressId ? existing.folder : null;
    if (!(await isHealthyEgress(active, folder))) {
      // Zombie (handler died with a container restart) — clear it and
      // start fresh below. Otherwise it blocks every future broadcast.
      await killZombie(active.egressId);
      active = null;
    } else if (existing && existing.egressId === active.egressId) {
      return existing;
    } else if (active) {
      // Healthy but unknown to us (e.g. app restarted mid-match) — adopt.
      const adoptFolder = existing?.folder ?? path.join(HLS_ROOT, String(Date.now()));
      const st: HlsState = {
        egressId: active.egressId,
        folder: adoptFolder,
        playlistUrl: existing?.playlistUrl ?? `${PUBLIC_HLS_BASE}/${path.basename(adoptFolder)}/index.m3u8`,
        startedAt: Date.now(),
      };
      await writeState(st);
      return st;
    }
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

// Track the last time a cameraman was actually connected (module-level,
// survives across requests in this server process). Used to auto-stop a
// stale broadcast: when the operator closes their browser WITHOUT pressing
// stop, broadcast-state.json keeps selectedSlot set forever and the egress
// would record a black placeholder for hours. After NO cameraman for 5
// minutes we finalize the recording (playlist gets #EXT-X-ENDLIST → the
// session becomes a usable VOD) and clear the stale state.
let lastCameramanSeenAt = 0;
const STALE_BROADCAST_MS = 5 * 60_000;

async function anyCameramanConnected(): Promise<boolean> {
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const rs = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
    const participants = await rs.listParticipants(ROOM_NAME);
    const online = participants.some((p: any) => {
      try {
        const meta = p.metadata ? JSON.parse(p.metadata) : {};
        return meta.role === "cameraman" || !!meta.slot;
      } catch {
        return false;
      }
    });
    if (online) lastCameramanSeenAt = Date.now();
    return online;
  } catch (e: any) {
    // Room doesn't exist → definitely no cameraman. Transient API error →
    // assume the last known state so we never false-positive a stop.
    const msg = String(e?.message ?? "");
    if (msg.includes("does not exist") || msg.includes("not found")) {
      return false;
    }
    return lastCameramanSeenAt > 0;
  }
}

async function clearStaleBroadcastState(): Promise<void> {
  try {
    const stateFile = path.join(PROJECT_ROOT, "db", "broadcast-state.json");
    const raw = await readFile(stateFile, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.metadata?.selectedSlot != null) {
      parsed.metadata.selectedSlot = null;
      await writeFile(stateFile, JSON.stringify(parsed, null, 2));
      console.log("[hls-egress] stale broadcast cleared (no cameraman for 5min)");
    }
  } catch {}
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
    // Only self-heal when a cameraman is actually connected — otherwise we
    // would resurrect recordings for broadcasts that are really over.
    if (await anyCameramanConnected()) {
      try {
        const healed = await ensureOnce();
        if (healed) active = await findActiveEgress().catch(() => null);
      } catch (e: any) {
        console.warn("[hls-egress] self-heal failed:", e?.message);
      }
    }
  }

  if (active) {
    const online = await anyCameramanConnected();
    // Reference point: the last time THIS process saw a cameraman, or the
    // egress start time (covers a server restart mid-stale-broadcast).
    const reference = Math.max(lastCameramanSeenAt, st?.startedAt ?? 0);
    const stale =
      (await broadcastIsOn()) &&
      !online &&
      Date.now() - reference > STALE_BROADCAST_MS;
    if (stale) {
      // Operator vanished without stopping → finalize the recording and
      // clear the stale broadcast state so the site shows "off air".
      await stopHlsEgress();
      await clearStaleBroadcastState();
      return { active: false, ready: false, url: null };
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
