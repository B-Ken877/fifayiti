"use client";
import { type Match } from "@/lib/fifayiti-data";
import { TeamCrest } from "../../team-crest";
import { LiveBadge } from "../../live-badge";
import { Clock, Play, Pause } from "lucide-react";
import { formatKickoff } from "@/lib/fifayiti-data";

interface TeamLike {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
}

/**
 * MatchScoreboard — broadcast-style scoreboard.
 *
 * Now accepts an `onFormatClock` callback so the parent (which owns the
 * chronometer state) can format the clock as M:SS instead of an integer
 * minute. Also accepts `running` so we can show a play/pause indicator.
 */
export function MatchScoreboard({
  match,
  home,
  away,
  scoreHome,
  scoreAway,
  clock,
  half,
  isLive,
  running,
  onFormatClock,
}: {
  match: Match;
  home: TeamLike;
  away: TeamLike;
  scoreHome: number;
  scoreAway: number;
  clock: number;
  half: Match["half"];
  isLive: boolean;
  running?: boolean;
  onFormatClock?: (seconds: number) => string;
}) {
  const halfTone =
    half === "PRE"
      ? { bg: "#E4E7EC", fg: "#667085" }
      : half === "POST"
      ? { bg: "#D92D20", fg: "#FFFFFF" }
      : half === "HT"
      ? { bg: "#F4C400", fg: "#084C2A" }
      : { bg: "#116B3A", fg: "#FFFFFF" };

  const halfLabel =
    half === "PRE"
      ? "Pre-match"
      : half === "HT"
      ? "Mwatye tan"
      : half === "POST"
      ? "Fini"
      : `${half === 1 ? "1ye" : "2yèm"} mitan`;

  const clockLabel = onFormatClock
    ? onFormatClock(clock ?? 0)
    : `${clock ?? 0}'`;

  return (
    <>
      {/* Stage pill + live badge / kickoff */}
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center px-2 py-1 rounded eyebrow bg-[#116B3A] text-white">
          {match.stage === "GROUP" ? `Group ${match.group}` : match.stage}
        </span>
        {isLive ? (
          <LiveBadge variant="green" size="sm" label={`An dirèk · ${clockLabel}`} />
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded eyebrow bg-[#F4F7F3] text-[#667085]">
            {formatKickoff(match.kickoff)}
          </span>
        )}
      </div>

      {/* Score + clock layout */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
        {/* Home */}
        <div className="flex flex-col items-center md:flex-row md:justify-end gap-3 text-center md:text-right">
          <div className="order-2 md:order-1">
            <p className="heading-md text-[#084C2A]">{home.name}</p>
            <p className="meta text-[#667085]">{home.shortName}</p>
          </div>
          <div className="order-1 md:order-2">
            {home.logoUrl ? (
              <img src={home.logoUrl} alt={home.name} className="w-14 h-14 md:w-16 md:h-16 object-contain" />
            ) : (
              <TeamCrest
                teamId={home.id}
                shortName={home.shortName}
                primary={home.primaryColor}
                secondary={home.secondaryColor}
                size="lg"
              />
            )}
          </div>
        </div>

        {/* Score + clock — MASSIVE */}
        <div className="flex flex-col items-center">
          <p className="score text-7xl md:text-8xl text-[#084C2A]">
            <span className="tnum">{scoreHome}</span>
            <span className="text-[#98A2B3] mx-1">-</span>
            <span className="tnum">{scoreAway}</span>
          </p>
          {/* Clock — chronometer format (M:SS) */}
          <p className="score text-5xl text-[#084C2A] tnum mt-2 flex items-center gap-2">
            {running ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#116B3A] animate-pulse" />
                {clockLabel}
              </span>
            ) : (
              <span>{clockLabel}</span>
            )}
          </p>
          {/* Half pill */}
          <div
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg eyebrow"
            style={{ background: halfTone.bg, color: halfTone.fg }}
          >
            {running ? <Pause size={12} /> : <Clock size={12} />}
            {halfLabel}
          </div>
        </div>

        {/* Away */}
        <div className="flex flex-col items-center md:flex-row md:justify-start gap-3 text-center md:text-left">
          <div className="order-1">
            {away.logoUrl ? (
              <img src={away.logoUrl} alt={away.name} className="w-14 h-14 md:w-16 md:h-16 object-contain" />
            ) : (
              <TeamCrest
                teamId={away.id}
                shortName={away.shortName}
                primary={away.primaryColor}
                secondary={away.secondaryColor}
                size="lg"
              />
            )}
          </div>
          <div className="order-2">
            <p className="heading-md text-[#084C2A]">{away.name}</p>
            <p className="meta text-[#667085]">{away.shortName}</p>
          </div>
        </div>
      </div>
    </>
  );
}

// Re-export for convenience to consumers that want the kickoff pill UI piece.
export function MatchPickerCard({
  homeShort,
  awayShort,
  kickoff,
  venue,
  onClick,
}: {
  homeShort: string;
  awayShort: string;
  kickoff: string;
  venue: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-[#E4E7EC] bg-white p-3 hover:border-[#116B3A] transition-colors"
    >
      <p className="body-sm font-bold text-[#101828]">
        {homeShort} vs {awayShort}
      </p>
      <p className="meta text-[#667085] mt-0.5 inline-flex items-center gap-1">
        <Play size={10} className="text-[#116B3A]" /> {formatKickoff(kickoff)} · {venue}
      </p>
    </button>
  );
}
