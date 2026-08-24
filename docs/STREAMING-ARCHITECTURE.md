# FIFAYITI TV — Streaming Architecture

This document maps the complete live-streaming architecture as of Task 15
(HLS/DVR broadcast player), explains every design decision, and shows how
today's system evolves into the future replay/highlights platform.

## 1. Architecture map

```
                            ┌──────────────────────────────────────────┐
                            │                VPS (Docker)              │
                            │                                          │
  Camera (phone browser)    │  ┌────────────────┐                      │
  WebRTC publish ~1s ───────┼─▶│ livekit-server │◀── RTMP (Streamlabs)─┼── Camera (phone app, backup)
  (PRIMARY ingest path)     │  │    :7880       │◀── WHIP (OBS) ───────┼── Camera (laptop, backup)
                            │  └───────┬────────┘                      │
                            │          │ room "fifayiti-broadcast"     │
                            │          │                               │
                            │          ▼                               │
                            │  ┌────────────────┐    operator selects  │
                            │  │ medika-egress  │◀── on-air camera via │
                            │  │ (livekit/egress│   custom template    │
                            │  │  + headless    │   (reads room        │
                            │  │  Chrome)       │    metadata          │
                            │  └───────┬────────┘    selectedSlot)     │
                            │          │ x264 720p30 ~2.5Mbps          │
                            │          ▼                               │
                            │  /var/www/fifayiti/hls/<session>/        │
                            │    index.m3u8  (EVENT playlist = DVR)    │
                            │    live.m3u8   (sliding live window)     │
                            │    index_000NN.ts (1s segments)          │
                            │          │                               │
                            │          ▼                               │
                            │       nginx :443  /hls/                  │
                            └──────────┼───────────────────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                   TV viewer browser          (same origin,
                   hls.js BroadcastPlayer     CDN-ready later)
```

## 2. The two viewer paths

| Path | When | Latency | Features |
|------|------|---------|----------|
| **HLS BroadcastPlayer** (hls.js) | Egress active + playlist ready (normal live state) | ~3-4s controlled | DVR timeline, pause/resume, ±10s, scrub, RETOUNEN LIVE, fullscreen |
| **WebRTC fallback** (livekit-client) | Egress warming up (~20s at broadcast start) or unavailable | ~1s | Plain video, no DVR |

The TV page polls `/api/livekit-hls` every 5s and switches automatically.
While HLS is active the WebRTC video tracks are **unsubscribed** (bandwidth
saving) but the room connection stays for metadata + viewer count.

## 3. Latency budget (measured 2026-08-24)

| Stage | Cost |
|-------|------|
| Camera → livekit (WebRTC ingest) | ~0.3s |
| Egress chrome capture + x264 encode + segmenter | ~2.0s (fixed, inherent to egress) |
| Playlist edge (1s segments) | ~0.7s |
| hls.js live sync (liveSyncDuration: 1.0) | ~1.0s |
| **Glass-to-glass total** | **~3.7s** (target 2-3s, hard max 5s) |

Tuning knobs:
- `SEGMENT_DURATION` in `src/lib/streaming/hls-egress.ts` (1s now)
- `liveSyncDuration` in `broadcast-player.tsx` (1.0s now; raise to 1.5-2
  for more stability on very weak networks, at the cost of latency)

Robustness: hls.js fragment/manifest retry policies are set aggressively
(6-8 retries with backoff); `maxLiveSyncPlaybackRate: 1.25` catches the
player up gently after network dips.

## 4. Broadcast lifecycle (all automatic)

1. Operator clicks **VOYE SOU TV** → `POST /api/livekit-room`
   `{selectedSlot: N}` → `ensureHlsEgress()` starts the egress
   (unique session folder per broadcast).
2. Egress chrome loads `/egress-template` (served by this app), which
   subscribes ONLY to the participant whose `metadata.slot` equals the
   room metadata `selectedSlot` — the broadcast follows the operator's
   camera switches seamlessly, with DVR continuity.
3. Camera network blips (<20s) are absorbed by the operator-page grace
   period — the broadcast selection is never wiped by a blip.
4. Operator stops the broadcast → `selectedSlot: null` → `stopHlsEgress()`
   → playlist finalized with `#EXT-X-ENDLIST` → **the session folder is a
   complete VOD recording of the match**.
5. **Self-healing**: if the egress dies (crash, app restart race), the
   viewer status polls detect "broadcast on + egress dead" and restart it.

## 5. Future replay platform — why this architecture is ready

| Future feature | Already in place |
|----------------|------------------|
| **Instant replay** ("Goal at 72:14") | The EVENT playlist + 1s segments ARE the buffer — the footage around any timestamp is on disk seconds after it happens. A replay control can just seek/serve those segments (same or a second player). |
| **Full match replay** | Each broadcast session folder = finalized VOD with ENDLIST playlist. Serve `/hls/<session>/index.m3u8` in a replay page. |
| **Highlights/clips** | Segments are plain 1s MPEG-TS files — ffmpeg can cut/join any range losslessly. |
| **Event markers** | Match events already live in the DB with minute timestamps; correlate with playlist PROGRAM-DATE-TIME (wall-clock) to find the segment range. |
| **CDN / scale** | HLS is HTTP — point a CDN at `/hls/` and you scale to thousands of viewers with zero code change. |

## 6. Components reference

| File | Role |
|------|------|
| `src/components/fifayiti/tv/broadcast-player.tsx` | hls.js player: DVR timeline, LIVE controls, rotating fullscreen button (bottom-right), auto-hide bar, keyboard shortcuts |
| `src/components/fifayiti/tv/tv-page.tsx` | Polls HLS status, switches HLS ↔ WebRTC fallback, overlays scorebug |
| `src/app/egress-template/[[...slug]]/route.ts` | Custom egress recording template (follows selectedSlot; signals START_RECORDING) |
| `src/lib/streaming/hls-egress.ts` | Egress lifecycle: ensure/stop/self-heal, session state in `db/hls-state.json` |
| `src/app/api/livekit-hls/route.ts` | Viewer status + staff manual start/stop |
| `src/app/api/livekit-room/route.ts` | Broadcast state + drives egress start/stop |
| `/opt/egress/` (VPS) | livekit/egress container (host network, redis, chrome) |
| nginx `/hls/` | Serves segments with correct MIME types, no-cache playlists |
| `scripts/cleanup-hls.sh` | Daily retention: 7 days age cap + 6GB size cap, protects active session |

## 7. Operational notes

- **Disk**: ~1.1 GB per broadcast hour. Retention cron keeps it under
  control; expanding the disk (or offloading old sessions to object
  storage) is the next infra step for keeping full seasons.
- **CPU**: egress adds ~2 cores while live (chrome + x264). The VPS has 6;
  with the RTMP transcoder also active there is headroom for 1 broadcast.
- **Audio**: phone-browser cameras publish video-only (muted stadium
  ambient by design). RTMP/OBS sources DO carry audio; the pipeline
  transcodes it to AAC automatically.
- **Server region**: the VPS is in Germany (~460-700ms RTT to Haiti).
  Moving to US-East would improve WebRTC paths and HLS fetch times.
