"use client";
import { cn } from "@/lib/utils";
import { type Match } from "@/lib/fifayiti-data";
import { LiveMatchModule } from "./live-match-module";

interface MatchCardProps {
  match: Match;
  variant?: "compact" | "wide";
  className?: string;
}

/**
 * MatchCard — thin wrapper over LiveMatchModule for backwards compatibility.
 * - variant="compact" → card layout (default for grids)
 * - variant="wide" → wide card layout (for listings)
 */
export function MatchCard({ match, variant = "compact", className }: MatchCardProps) {
  return (
    <LiveMatchModule
      match={match}
      variant={variant === "wide" ? "card" : "card"}
      className={cn(className)}
    />
  );
}
