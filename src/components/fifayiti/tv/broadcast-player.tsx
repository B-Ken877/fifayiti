"use client";

// FIFAYITI BroadcastPlayer — the professional live player for FIFAYITI TV.
//
// Powered by hls.js on top of the livekit-egress HLS/DVR pipeline:
//   • ~2-4s controlled latency (target 2-3s, hard max ~5s)
//   • EVENT playlist → the whole match so far is seekable (DVR)
//   • Pause / resume, ±10s jumps, timeline scrubbing
//   • "RETOUNEN LIVE" button + "X:XX dèyè LIVE" indicator
//   • YouTube-style fullscreen button (bottom-right) whose icon rotates
//     when toggling
//
// Children (scorebug, live badge, goal flash) render as overlays on top.

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BroadcastPlayerProps {
  src: string;
  children?: React.ReactNode;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export function BroadcastPlayer({ src, children }: BroadcastPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [hasAudio, setHasAudio] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [liveEdge, setLiveEdge] = useState(0); // position (s) of live edge
  const [seekStart, setSeekStart] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [stalled, setStalled] = useState(false);

  // ── HLS setup ─────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Native HLS (iOS Safari) — no DVR controls customization needed there,
    // still gets live playback; hls.js everywhere else.
    if (!Hls.isSupported()) {
      video.src = src;
      return;
    }

    const hls = new Hls({
      // Live-edge target: ~1s behind the newest fragment. Combined with
      // 1s server-side segments and ~2s of egress encode latency this keeps
      // glass-to-glass at ~3.5-4s (target 2-3s, hard max 5s) while giving
      // the buffer room to absorb network variation.
      liveSyncDuration: 1.0,
      maxLiveSyncPlaybackRate: 1.25, // gentle catch-up if drifting
      // Keep a rolling in-browser back buffer so short rewinds don't refetch.
      backBufferLength: 300, // 5 min
      maxBufferLength: 15,
      // Robustness on weak networks:
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 10000,
          maxLoadTimeMs: 20000,
          timeoutRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 4000 },
          errorRetry: { maxNumRetry: 8, retryDelayMs: 500, maxRetryDelayMs: 4000 },
        },
      },
      manifestLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 10000,
          maxLoadTimeMs: 20000,
          timeoutRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 4000 },
          errorRetry: { maxNumRetry: 8, retryDelayMs: 500, maxRetryDelayMs: 4000 },
        },
      },
    });
    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      const level = hls.levels[hls.currentLevel] ?? hls.levels[0];
      if (level && !level.audioCodec && (level.audioGroupIds?.length ?? 0) === 0) {
        setHasAudio(false); // camera publishes video-only → hide volume
      }
      // Start AT the live edge
      if (hls.liveSyncPosition != null) video.currentTime = hls.liveSyncPosition;
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setStalled(true);
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      }
    });

    hls.on(Hls.Events.FRAG_BUFFERED, () => setStalled(false));
    hls.loadSource(src);
    hls.attachMedia(video);

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  // ── Time / live-edge tracking ─────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      if (seekingRef.current) return;
      setCurrentTime(video.currentTime);
      const hls = hlsRef.current;
      const edge = hls?.liveSyncPosition ?? video.seekable.length ? (video.seekable.end(video.seekable.length - 1) || 0) : 0;
      if (edge && isFinite(edge)) setLiveEdge(edge);
      const s = video.seekable.length ? video.seekable.start(0) : 0;
      if (s && isFinite(s)) setSeekStart(s);
      if (video.buffered.length) setBufferedEnd(video.buffered.end(video.buffered.length - 1));
    };
    const onPlay = () => { setPlaying(true); setControlsAutoHide(); };
    const onPause = () => { setPlaying(false); setControlsVisible(true); };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => { setWaiting(false); setStalled(false); };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
    };
  }, []);

  // ── Controls auto-hide (YouTube behavior) ─────────────────────────
  const setControlsAutoHide = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2600);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const show = () => setControlsAutoHide();
    el.addEventListener("mousemove", show);
    el.addEventListener("touchstart", show, { passive: true });
    return () => {
      el.removeEventListener("mousemove", show);
      el.removeEventListener("touchstart", show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [setControlsAutoHide]);

  // ── Fullscreen ────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen?.();
        const o = (screen as any).orientation;
        if (o?.lock) { try { await o.lock("landscape"); } catch {} }
      } else {
        await document.exitFullscreen?.();
        const o = (screen as any).orientation;
        if (o?.unlock) { try { await o.unlock(); } catch {} }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const f = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  // ── Playback actions ──────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const start = v.seekable.length ? v.seekable.start(0) : 0;
    const edge = hlsRef.current?.liveSyncPosition
      ?? (v.seekable.length ? v.seekable.end(v.seekable.length - 1) : t);
    const clamped = Math.max(start + 0.5, Math.min(t, edge - 0.5));
    v.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    seekTo(v.currentTime + delta);
  }, [seekTo]);

  const returnToLive = useCallback(() => {
    const v = videoRef.current;
    const hls = hlsRef.current;
    if (!v) return;
    if (hls?.liveSyncPosition != null) v.currentTime = hls.liveSyncPosition;
    v.play().catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": case "j": seekBy(-10); break;
        case "ArrowRight": case "l": seekBy(10); break;
        case "f": toggleFullscreen(); break;
        case "m": toggleMute(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleFullscreen, toggleMute]);

  // ── Derived state ─────────────────────────────────────────────────
  const latency = liveEdge > 0 ? Math.max(0, liveEdge - currentTime) : 0;
  const isLive = latency < 6;
  const dur = Math.max(0.001, liveEdge - seekStart);
  const playedPct = Math.min(100, ((currentTime - seekStart) / dur) * 100);
  const bufferedPct = Math.min(100, ((bufferedEnd - seekStart) / dur) * 100);
  const scrubbing = !isLive;

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = seekStart + (parseFloat(e.target.value) / 100) * dur;
    seekTo(t);
  };

  const onScrubStart = () => { seekingRef.current = true; };
  const onScrubEnd = () => { seekingRef.current = false; };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden group select-none"
      onClick={(e) => {
        // Single click on the video area toggles play (desktop feel).
        if ((e.target as HTMLElement).tagName === "VIDEO") togglePlay();
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).tagName === "VIDEO") toggleFullscreen();
      }}
    >
      {/* ═══ VIDEO ═══ */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        autoPlay
        muted
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />

      {/* Overlays from the TV page (scorebug, LIVE badge, goal flash…) */}
      {children}

      {/* Center state: buffering / paused / stalled */}
      {waiting && playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 size={44} className="text-[#F4C400] animate-spin" />
        </div>
      )}
      {!playing && !waiting && (
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="absolute inset-0 flex items-center justify-center"
          aria-label="Jwe"
        >
          <span className="w-16 h-16 rounded-full bg-black/60 backdrop-blur flex items-center justify-center border border-white/20 transition-transform hover:scale-110">
            <Play size={28} className="text-white ml-1" fill="white" />
          </span>
        </button>
      )}
      {stalled && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-black/70 backdrop-blur pointer-events-none">
          <p className="body-sm text-[#F4C400]">Ap rekipere rezo a...</p>
        </div>
      )}

      {/* ═══ CONTROL BAR (YouTube-style, auto-hide) ═══ */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-10 pb-1.5 px-3 sm:px-4 transition-opacity duration-300",
          controlsVisible || !playing || scrubbing ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Timeline */}
        <div className="relative h-4 flex items-center cursor-pointer group/tl mb-1">
          <div className="absolute inset-x-0 h-1 group-hover/tl:h-1.5 transition-all bg-white/25 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-[#F4C400]" style={{ width: `${playedPct}%` }} />
          </div>
          {/* playhead */}
          <div
            className="absolute w-3 h-3 rounded-full bg-[#F4C400] shadow-md transition-transform scale-0 group-hover/tl:scale-100"
            style={{ left: `calc(${playedPct}% - 6px)` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={0.05}
            value={playedPct}
            onChange={onScrub}
            onMouseDown={onScrubStart}
            onMouseUp={onScrubEnd}
            onTouchStart={onScrubStart}
            onTouchEnd={onScrubEnd}
            aria-label="Taymlin DVR"
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <PlayerBtn onClick={togglePlay} label={playing ? "Poz" : "Jwe"}>
            {playing ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
          </PlayerBtn>

          <PlayerBtn onClick={() => seekBy(-10)} label="10 segond deyè">
            <RotateCcw size={19} />
          </PlayerBtn>
          <PlayerBtn onClick={() => seekBy(10)} label="10 segyon anvan">
            <RotateCw size={19} />
          </PlayerBtn>

          {/* Volume */}
          {hasAudio ? (
            <div className="flex items-center gap-1.5 group/vol">
              <PlayerBtn onClick={toggleMute} label="Son">
                {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </PlayerBtn>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                aria-label="Volim"
                className="w-0 group-hover/vol:w-16 sm:w-16 transition-all h-1 accent-[#F4C400] cursor-pointer"
              />
            </div>
          ) : (
            <span className="eyebrow text-white/35 px-1 hidden sm:inline">SAN SON</span>
          )}

          {/* Behind-LIVE indicator */}
          {!isLive && (
            <span className="eyebrow px-2 py-1 rounded bg-black/50 text-white/70 tnum">
              {fmt(latency)} dèyè LIVE
            </span>
          )}

          <div className="flex-1" />

          {/* LIVE / RETOUNEN LIVE */}
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#D92D20]">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="eyebrow text-white">LIVE</span>
            </span>
          ) : (
            <button
              onClick={returnToLive}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#D92D20] hover:brightness-110 transition"
              aria-label="Retounen sou live"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="eyebrow text-white">RETOUNEN LIVE</span>
            </button>
          )}

          {/* FULLSCREEN — bottom-right, icon rotates when toggling (YouTube-style) */}
          <PlayerBtn onClick={toggleFullscreen} label="Plein ekran" className="ml-0.5">
            <span
              className={cn(
                "inline-flex items-center justify-center transition-transform duration-300 ease-out",
                isFullscreen && "rotate-180"
              )}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </span>
          </PlayerBtn>
        </div>
      </div>
    </div>
  );
}

function PlayerBtn({
  children, onClick, label, className,
}: {
  children: React.ReactNode; onClick: () => void; label: string; className?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-white/15 transition-colors",
        className
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
