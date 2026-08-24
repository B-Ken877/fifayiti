"use client";
/**
 * ScoreBug — professional broadcast-style score overlay.
 *
 * Placement convention (FIFA / UEFA / major networks): TOP-LEFT corner of the
 * video frame, with a small margin. The LIVE badge belongs top-right.
 *
 * Layout:
 *   [ 34' ] KNPV [ 2 – 1 ] KTLP
 *   clock   home    score   away
 *
 * SIZE PHILOSOPHY: a scorebug must stay discreet — viewers are here for the
 * match, not the graphic. Real broadcast + streaming-player overlays (YouTube
 * live, FIFA+) sit around a quarter of the frame width and ~5% of its height.
 * Mobile: 24px tall; desktop: 28px. Three-letter team codes keep the width
 * tight.
 *
 *   - Clock segment: brand yellow, dark text, tabular numerals.
 *   - Team segments: near-black translucent + blur, vertical team-color bar,
 *     uppercase bold abbreviation.
 *   - Score segment: darkest block, extrabold tabular numerals; flashes
 *     brand yellow for a few seconds when a goal is scored (goalFlash).
 *
 * The parent positions this component (e.g. absolute top-2 left-2 z-10).
 */
import { cn } from "@/lib/utils";

export interface ScoreBugProps {
  homeShort: string;
  homeColor?: string;
  awayShort: string;
  awayColor?: string;
  homeScore: number;
  awayScore: number;
  /** Match minute (NOT seconds — convert with Math.floor(clock/60)). */
  minute?: number | null;
  /** Flash the score segment (goal celebration). */
  goalFlash?: boolean;
  className?: string;
}

export function ScoreBug({
  homeShort,
  homeColor,
  awayShort,
  awayColor,
  homeScore,
  awayScore,
  minute,
  goalFlash,
  className,
}: ScoreBugProps) {
  return (
    <div
      className={cn(
        // Compact broadcast bug — small enough to never obstruct play.
        "flex items-stretch h-6 md:h-7 rounded overflow-hidden shadow-lg ring-1 ring-black/40 select-none",
        className
      )}
    >
      {/* Clock — yellow, leftmost (broadcast convention) */}
      {minute != null && (
        <div className="flex items-center px-1.5 bg-[#F4C400]">
          <span className="text-[10px] md:text-[11px] font-extrabold text-[#08240F] tnum leading-none">
            {minute}&prime;
          </span>
        </div>
      )}

      {/* Home team */}
      <div className="flex items-center gap-1 pl-1.5 pr-1.5 bg-black/80 backdrop-blur-md">
        <span
          aria-hidden
          className="w-[2px] h-[11px] md:h-[13px] rounded-full shrink-0"
          style={{ background: homeColor ?? "#116B3A" }}
        />
        <span className="text-[10px] md:text-[11px] font-bold text-white tracking-wide leading-none">
          {(homeShort ?? "???").slice(0, 3).toUpperCase()}
        </span>
      </div>

      {/* Score */}
      <div
        className={cn(
          "flex items-center gap-0.5 px-1.5 transition-colors duration-150",
          goalFlash ? "bg-[#F4C400]" : "bg-black/90 backdrop-blur-md"
        )}
      >
        <span
          className={cn(
            "text-[11px] md:text-xs font-extrabold tnum leading-none",
            goalFlash ? "text-[#08240F]" : "text-white"
          )}
        >
          {homeScore}
        </span>
        <span
          className={cn(
            "text-[9px] md:text-[10px] font-bold leading-none",
            goalFlash ? "text-[#08240F]/60" : "text-white/40"
          )}
        >
          &ndash;
        </span>
        <span
          className={cn(
            "text-[11px] md:text-xs font-extrabold tnum leading-none",
            goalFlash ? "text-[#08240F]" : "text-white"
          )}
        >
          {awayScore}
        </span>
      </div>

      {/* Away team (mirrored) */}
      <div className="flex items-center gap-1 pl-1.5 pr-1.5 bg-black/80 backdrop-blur-md">
        <span className="text-[10px] md:text-[11px] font-bold text-white tracking-wide leading-none">
          {(awayShort ?? "???").slice(0, 3).toUpperCase()}
        </span>
        <span
          aria-hidden
          className="w-[2px] h-[11px] md:h-[13px] rounded-full shrink-0"
          style={{ background: awayColor ?? "#667085" }}
        />
      </div>
    </div>
  );
}
