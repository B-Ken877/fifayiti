"use client";
import { cn } from "@/lib/utils";

interface LiveBadgeProps {
  size?: "sm" | "md" | "lg";
  variant?: "green" | "yellow" | "red";
  label?: string;
  showPulse?: boolean;
  className?: string;
}

/**
 * LiveBadge — broadcast-quality LIVE indicator.
 * Default: green (on dark/green surfaces, white text). Yellow variant for hero overlays.
 */
export function LiveBadge({
  size = "md",
  variant = "green",
  label = "An dirèk",
  showPulse = true,
  className,
}: LiveBadgeProps) {
  const colorBg = variant === "green" ? "#116B3A" : variant === "yellow" ? "#F4C400" : "#D92D20";
  const colorText = variant === "yellow" ? "#084C2A" : "#FFFFFF";
  const dot = variant === "green" ? "#7CE7A8" : variant === "yellow" ? "#FFF1A0" : "#FFB3AC";
  const fs = size === "sm" ? 10 : size === "md" ? 11 : 13;
  const pad = size === "sm" ? "3px 8px" : "4px 10px";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full font-bold uppercase", className)}
      style={{
        background: colorBg,
        color: colorText,
        fontSize: fs,
        padding: pad,
        letterSpacing: "0.10em",
      }}
      aria-label={label}
    >
      <span className="relative flex items-center justify-center" style={{ width: 8, height: 8 }}>
        {showPulse && (
          <span
            className="live-pulse absolute inline-flex rounded-full"
            style={{ width: 8, height: 8, color: dot }}
          />
        )}
        <span className="relative inline-flex rounded-full" style={{ width: 8, height: 8, background: dot }} />
      </span>
      {label}
    </span>
  );
}
