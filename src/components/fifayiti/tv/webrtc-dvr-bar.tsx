"use client";

// FIFAYITI WebRTC DVR control bar.
//
// The HLS/DVR BroadcastPlayer only mounts when the egress pipeline is
// running (needs object storage in LiveKit Cloud). On the direct WebRTC
// path — what viewers actually use today — this bar provides the same
// YouTube-style controls on top of the client-side rolling buffer:
//
//   • Pause / resume (true DVR pause — the picture freezes while the
//     buffer keeps recording, and "X:XX dèyè LIVE" grows)
//   • ↺ 10s back / ↻ 10s forward jumps
//   • Draggable timeline over the last ~60s (drag = scrub, like YouTube)
//   • Red RETOUNEN LIVE button + LIVE badge
//   • Fullscreen, auto-hide after 2.6s of inactivity
//
// Visual design mirrors BroadcastPlayer so the two players feel
// identical to viewers regardless of which pipeline is active.

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize2, Minimize2, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WebrtcDvrBarProps {
  mode: "live" | "paused" | "dvr";
  behindSec: number;
  windowSec: number;
  clipPaused: boolean;
  viewerCount: number;
  isFullscreen: boolean;
  onTogglePlay: () => void;
  onJump: (deltaSec: number) => void; // -10 = back, +10 = toward live
  onScrub: (secBehindLive: number) => void;
  onReturnLive: () => void;
  onToggleFullscreen: () => void;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export function WebrtcDvrBar(props: WebrtcDvrBarProps) {
  const { mode, behindSec, windowSec, clipPaused, viewerCount, isFullscreen } = props;

  const [controlsVisible, setControlsVisible] = useState(true);
  const [dragPct, setDragPct] = useState<number | null>(null); // timeline % while dragging
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const atLive = mode === "live";
  const paused = mode === "paused" || clipPaused;
  // While paused-at-live the picture is frozen; while a DVR clip is frozen
  // mid-playback clipPaused covers it. Otherwise playing.
  const playing = !paused;

  // ── Auto-hide (YouTube behavior) ───────────────────────────────────
  const bump = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Keep the bar visible whenever the viewer is NOT simply watching
      // live: paused, behind live, or dragging.
      setControlsVisible(false);
    }, 2600);
  }, []);

  useEffect(() => {
    bump();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [bump]);

  // Wake on ANY pointer activity over the PLAYER (the parent container),
  // not just over the bar itself — while hidden the bar is
  // pointer-events:none, so its own handlers would never fire and the
  // viewer could not reveal the controls by hovering the video (the
  // HLS BroadcastPlayer does the same via its container listeners).
  useEffect(() => {
    const parent = barRef.current?.parentElement;
    if (!parent) return;
    const show = () => bump();
    parent.addEventListener("mousemove", show);
    parent.addEventListener("touchstart", show, { passive: true });
    return () => {
      parent.removeEventListener("mousemove", show);
      parent.removeEventListener("touchstart", show);
    };
  }, [bump]);

  // Never hide while paused / behind / dragging — the viewer is doing
  // something deliberate with the timeline.
  const pinned = paused || !atLive || dragPct !== null;

  // ── Timeline mapping ───────────────────────────────────────────────
  // Right edge (100%) = LIVE. Left edge (0%) = oldest moment in the
  // rolling buffer. Playhead position = 100 − behind%.
  const win = Math.max(10, windowSec);
  const shownBehind = dragPct != null ? ((100 - dragPct) / 100) * win : Math.min(behindSec, win);
  const posPct = Math.max(0, Math.min(100, 100 - (shownBehind / win) * 100));
  const scrubbingAvailable = windowSec >= 3; // buffer needs a few seconds

  const commitScrub = (pct: number) => {
    const secBehind = ((100 - pct) / 100) * win;
    setDragPct(null);
    props.onScrub(secBehind);
  };

  return (
    <div
      ref={barRef}
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-8 pb-1.5 px-3 sm:px-4 transition-opacity duration-300",
        controlsVisible || pinned || !playing ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Timeline (draggable, YouTube-style) ── */}
      {scrubbingAvailable ? (
        <div className="relative h-4 flex items-center cursor-pointer group/tl mb-1">
          <div className="absolute inset-x-0 h-1 group-hover/tl:h-1.5 transition-all bg-white/25 rounded-full overflow-hidden">
            {/* past (played) portion — FIFAYITI gold */}
            <div className="absolute inset-y-0 left-0 bg-[#F4C400]" style={{ width: `${posPct}%` }} />
          </div>
          {/* playhead */}
          <div
            className={cn(
              "absolute w-3 h-3 rounded-full bg-[#F4C400] shadow-md transition-transform",
              dragPct != null ? "scale-100" : "scale-0 group-hover/tl:scale-100"
            )}
            style={{ left: `calc(${posPct}% - 6px)` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={posPct}
            aria-label="Taylin DVR"
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            onChange={(e) => setDragPct(parseFloat(e.target.value))}
            onPointerUp={(e) => commitScrub(parseFloat((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => commitScrub(parseFloat((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => commitScrub(parseFloat((e.target as HTMLInputElement).value))}
            onBlur={(e) => { if (dragPct != null) commitScrub(parseFloat(e.target.value)); }}
          />
        </div>
      ) : (
        <div className="h-4 mb-1 flex items-center">
          <div className="h-1 w-full bg-white/15 rounded-full" />
        </div>
      )}

      {/* ── Buttons row ── */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        <DvrBtn onClick={props.onTogglePlay} label={playing ? "Poz" : "Jwe"}>
          {playing ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
        </DvrBtn>

        <DvrBtn onClick={() => props.onJump(-10)} label="10 segond deyè" disabled={!scrubbingAvailable}>
          <RotateCcw size={19} />
        </DvrBtn>
        <DvrBtn onClick={() => props.onJump(10)} label="10 segond anvan" disabled={atLive || !scrubbingAvailable}>
          <RotateCw size={19} />
        </DvrBtn>

        {/* Behind-LIVE indicator */}
        {!atLive && behindSec >= 2 && (
          <span className="eyebrow px-2 py-1 rounded bg-black/50 text-white/70 tnum whitespace-nowrap">
            {fmt(shownBehind)} dèyè LIVE
          </span>
        )}

        <div className="flex-1" />

        {/* Viewer count */}
        <div className="hidden xs:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/50 mr-0.5">
          <span className="text-[8px] text-white/50">Views</span>
          <span className="text-[8px] font-bold text-white tnum">{viewerCount}</span>
        </div>

        {/* LIVE / RETOUNEN LIVE */}
        {atLive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#D92D20]">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="eyebrow text-white">LIVE</span>
          </span>
        ) : (
          <button
            onClick={props.onReturnLive}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#D92D20] hover:brightness-110 transition"
            aria-label="Retounen sou live"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="eyebrow text-white whitespace-nowrap">RETOUNEN LIVE</span>
          </button>
        )}

        {/* Fullscreen */}
        <DvrBtn onClick={props.onToggleFullscreen} label="Plein ekran" className="ml-0.5">
          <span className="inline-flex items-center justify-center transition-transform duration-300 ease-out"
            style={{ transform: isFullscreen ? "rotate(180deg)" : undefined }}>
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </span>
        </DvrBtn>
      </div>
    </div>
  );
}

function DvrBtn({
  children, onClick, label, disabled, className,
}: {
  children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean; className?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-lg text-white transition-colors",
        disabled ? "opacity-30 cursor-default" : "hover:bg-white/15",
        className
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
