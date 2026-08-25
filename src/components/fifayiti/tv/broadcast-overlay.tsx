"use client";

// FIFAYITI Broadcast Overlay Engine (Task 18).
//
// Animated overlays for every match event the operator creates. Each event
// type has its own visual identity (GÒL = green celebration, FOT = orange
// banner, KAT_JON = yellow card, KAT_WOUJ = red card, CHANJMAN = blue
// substitution panel, KONÈ = corner flag, POZ/FEN = match state banners).
//
// The component manages a local event queue: when multiple events arrive
// in rapid succession (goal + yellow card + substitution), each plays in
// order. Replay-triggering events (GOL, FOT, KAT_JON, KAT_WOUJ) play
// their overlay BEFORE the replay starts — the overlay fills the replay
// engine's flush-wait gap naturally.
//
// Overlays do NOT block: replay, DVR controls, and the scoreboard remain
// accessible underneath. Overlays auto-dismiss after their configured
// duration. All text in natural Haitian Creole.

import { useEffect, useRef, useState } from "react";
import { Goal, Square, SquareArrowUp, Repeat, Flag, Play, Pause, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OverlayEvent {
  id: string;
  kind: string;
  teamShort?: string;
  teamColor?: string;
  playerInName?: string;
  playerOutName?: string;
  minute?: number;
  half?: string;
  createdAt: number;
}

const OVERLAY_DURATION_MS: Record<string, number> = {
  GOL: 5000,
  FOT: 4000,
  KAT_JON: 5000,
  KAT_WOUJ: 6000,
  RANPLASMAN: 5000,
  KONÈ: 3000,
  MWATYE_TAN: 5000,
  DEZYEM_MITAN: 5000,
  FEN_MATCH: 8000,
};

const OVERLAY_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  GOL: { label: "GÒL!", color: "#116B3A", icon: Goal },
  FOT: { label: "FOT", color: "#F97316", icon: Flag },
  KAT_JON: { label: "KAT JÒN", color: "#F4C400", icon: Square },
  KAT_WOUJ: { label: "KAT WOUJ", color: "#D92D20", icon: SquareArrowUp },
  RANPLASMAN: { label: "CHANJMAN", color: "#2563EB", icon: Repeat },
  KONÈ: { label: "KÒNÈ", color: "#667085", icon: Flag },
  MWATYE_TAN: { label: "POZ", color: "#F4C400", icon: Pause },
  DEZYEM_MITAN: { label: "DEZYÈM MI-TAN", color: "#116B3A", icon: Play },
  FEN_MATCH: { label: "FEN MATCH LA", color: "#D92D20", icon: Flag },
};

export function BroadcastOverlay({ event }: { event: OverlayEvent | null }) {
  const [current, setCurrent] = useState<OverlayEvent | null>(null);
  const [queue, setQueue] = useState<OverlayEvent[]>([]);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  // When a new event arrives via props, add to queue (if not already seen)
  useEffect(() => {
    if (!event) return;
    if (seenIds.current.has(event.id)) return;
    seenIds.current.add(event.id);
    setQueue((q) => [...q, event]);
  }, [event]);

  // Process queue: play current, auto-dismiss after duration
  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);
    setExiting(false);

    const duration = OVERLAY_DURATION_MS[next.kind] ?? 5000;
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => {
        setCurrent(null);
        setExiting(false);
      }, 400); // exit animation
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, queue]);

  if (!current) return null;

  const meta = OVERLAY_META[current.kind] ?? { label: current.kind, color: "#667085", icon: Flag };
  const Icon = meta.icon;
  const teamColor = current.teamColor || meta.color;
  const minuteStr = current.minute != null ? `${current.minute}'` : "";

  // ── MATCH STATE OVERLAYS (centered banners) ────────────────────
  const isMatchState = ["MWATYE_TAN", "DEZYEM_MITAN", "FEN_MATCH"].includes(current.kind);

  if (isMatchState) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div
          className={cn(
            "px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 transition-all duration-300",
            exiting ? "scale-95 opacity-0" : "scale-100 opacity-100"
          )}
          style={{ background: "rgba(8,76,42,0.95)", border: `2px solid ${meta.color}` }}
        >
          <Icon size={32} style={{ color: meta.color }} />
          <span className="heading-lg" style={{ color: "#fff", fontFamily: "inherit" }}>
            {meta.label}
          </span>
          {minuteStr && (
            <span className="eyebrow text-white/60 tnum ml-2">{minuteStr}</span>
          )}
        </div>
      </div>
    );
  }

  // ── GOAL CELEBRATION (full-screen dramatic) ─────────────────────
  if (current.kind === "GOL") {
    return (
      <div className={cn(
        "absolute inset-0 z-30 pointer-events-none transition-opacity duration-400",
        exiting ? "opacity-0" : "opacity-100"
      )}>
        {/* Full-screen color burst */}
        <div className="absolute inset-0 animate-in fade-in" style={{
          background: `radial-gradient(circle at center, ${teamColor}33 0%, transparent 70%)`,
        }} />
        {/* Center card */}
        <div className={cn(
          "absolute inset-0 flex flex-col items-center justify-center transition-all duration-300",
          exiting ? "scale-90 opacity-0" : "scale-100 opacity-100"
        )}>
          <div className="px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3"
            style={{ background: "rgba(0,0,0,0.85)", border: `3px solid ${teamColor}` }}>
            <span className="text-6xl md:text-7xl font-black tracking-tight"
              style={{ color: teamColor, textShadow: `0 0 40px ${teamColor}66` }}>
              {meta.label}
            </span>
            {current.teamShort && (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-8 rounded" style={{ background: teamColor }} />
                <span className="text-2xl font-bold text-white">{current.teamShort}</span>
                <div className="w-2 h-8 rounded" style={{ background: teamColor }} />
              </div>
            )}
            {current.playerInName && (
              <span className="text-sm text-white/80 mt-1">{current.playerInName}</span>
            )}
            {minuteStr && (
              <span className="eyebrow text-white/50 tnum mt-1">{minuteStr}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── CARD OVERLAYS (yellow/red — rising from bottom) ──────────────
  if (current.kind === "KAT_JON" || current.kind === "KAT_WOUJ") {
    const isRed = current.kind === "KAT_WOUJ";
    return (
      <div className={cn(
        "absolute inset-0 z-30 pointer-events-none flex items-center justify-center transition-opacity duration-400",
        exiting ? "opacity-0" : "opacity-100"
      )}>
        <div className={cn(
          "flex flex-col items-center gap-3 transition-all duration-300",
          exiting ? "translate-y-8 opacity-0" : "translate-y-0 opacity-100"
        )}>
          {/* Card shape */}
          <div
            className="rounded-lg shadow-2xl flex items-center justify-center"
            style={{
              width: isRed ? 120 : 100,
              height: isRed ? 160 : 130,
              background: meta.color,
              boxShadow: `0 0 60px ${meta.color}44`,
            }}
          >
            <Icon size={isRed ? 48 : 40} className="text-white" />
          </div>
          {current.playerInName && (
            <div className="px-4 py-2 rounded-lg bg-black/80">
              <span className="text-sm font-bold text-white">{current.playerInName}</span>
            </div>
          )}
          {current.teamShort && (
            <span className="eyebrow text-white/70">{current.teamShort}</span>
          )}
          {minuteStr && (
            <span className="eyebrow text-white/50 tnum">{minuteStr}</span>
          )}
        </div>
      </div>
    );
  }

  // ── SUBSTITUTION PANEL ───────────────────────────────────────────
  if (current.kind === "RANPLASMAN") {
    return (
      <div className={cn(
        "absolute inset-0 z-30 pointer-events-none flex items-center justify-center transition-opacity duration-400",
        exiting ? "opacity-0" : "opacity-100"
      )}>
        <div className={cn(
          "px-6 py-4 rounded-2xl shadow-2xl transition-all duration-300",
          exiting ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )} style={{ background: "rgba(37,99,235,0.95)" }}>
          <div className="flex items-center gap-4">
            <Icon size={24} className="text-white" />
            <span className="heading-md text-white">{meta.label}</span>
            {minuteStr && <span className="eyebrow text-white/70 tnum">{minuteStr}</span>}
          </div>
          <div className="flex items-center gap-3 mt-3">
            {current.playerOutName && (
              <span className="px-3 py-1.5 rounded bg-white/20 text-white text-sm line-through opacity-70">
                {current.playerOutName}
              </span>
            )}
            <ChevronRight size={16} className="text-white/80" />
            {current.playerInName && (
              <span className="px-3 py-1.5 rounded bg-white text-blue-600 text-sm font-bold">
                {current.playerInName}
              </span>
            )}
          </div>
          {current.teamShort && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="w-2 h-4 rounded" style={{ background: teamColor }} />
              <span className="eyebrow text-white/70">{current.teamShort}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── FOUL + CORNER (slide-in banner from left) ───────────────────
  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex items-center">
      <div className={cn(
        "ml-4 md:ml-8 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300",
        exiting ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100"
      )} style={{ background: `rgba(0,0,0,0.9)`, borderLeft: `4px solid ${teamColor}` }}>
        <Icon size={20} style={{ color: meta.color }} />
        <span className="heading-sm text-white">{meta.label}</span>
        {current.teamShort && (
          <span className="eyebrow" style={{ color: teamColor }}>{current.teamShort}</span>
        )}
        {minuteStr && <span className="eyebrow text-white/50 tnum">{minuteStr}</span>}
        {current.playerInName && (
          <span className="text-sm text-white/70">{current.playerInName}</span>
        )}
      </div>
    </div>
  );
}
