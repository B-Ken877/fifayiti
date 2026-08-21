"use client";
import { cn } from "@/lib/utils";
import { TeamCrest } from "../team-crest";
import { LiveBadge } from "../live-badge";
import { useAppStore } from "@/store/app-store";
import { Play, MapPin, Radio } from "lucide-react";
import { useEffect, useState } from "react";

type LiveMatchVariant = "hero" | "card" | "compact";

interface MatchLike {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string;
  venue?: string | null;
  competition?: string;
  status: string;
  clock?: number;
  half?: string | number;
}

interface TeamLike {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
}

interface LiveMatchModuleProps {
  match: MatchLike;
  variant?: LiveMatchVariant;
  className?: string;
}

/**
 * Reusable Live Match Module — broadcast quality.
 * Fetches the home + away teams from /api/teams/[id] when rendered.
 */
export function LiveMatchModule({ match, variant = "hero", className }: LiveMatchModuleProps) {
  const { setView, setActiveMatchId } = useAppStore();
  const [home, setHome] = useState<TeamLike | null>(null);
  const [away, setAway] = useState<TeamLike | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hRes, aRes] = await Promise.all([
          fetch(`/api/teams/${match.homeTeamId}`).then((r) => r.json()),
          fetch(`/api/teams/${match.awayTeamId}`).then((r) => r.json()),
        ]);
        if (!cancelled) {
          setHome(hRes.team ?? null);
          setAway(aRes.team ?? null);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [match.homeTeamId, match.awayTeamId]);

  const isLive = match.status === "AN_DIRÈK";
  const isFinished = match.status === "FINI";
  const isScheduled = match.status === "PWOGRAM";

  const openMatch = () => {
    setActiveMatchId(match.id);
    setView("match");
  };

  const fmtKickoff = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
        " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };
  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  const halfLabel = match.half === 1 || match.half === "1" ? "1ye mitan"
    : match.half === 2 || match.half === "2" ? "2yèm mitan"
    : match.half === "HT" ? "Mwatye tan"
    : "";

  // Loading skeleton
  if (!home || !away) {
    return (
      <div className={cn("rounded-lg bg-[#F4F7F3] border border-[#D0D5DD] p-4 animate-pulse", className)}>
        <div className="h-3 bg-[#E4E7EC] rounded w-1/3 mb-3" />
        <div className="flex items-center justify-between">
          <div className="h-5 bg-[#E4E7EC] rounded w-1/4" />
          <div className="h-8 bg-[#E4E7EC] rounded w-12" />
          <div className="h-5 bg-[#E4E7EC] rounded w-1/4" />
        </div>
      </div>
    );
  }

  // ─── COMPACT ───
  if (variant === "compact") {
    return (
      <button
        onClick={openMatch}
        className={cn(
          "block w-full text-left rounded-lg bg-white border border-[#D0D5DD] hover:border-[#116B3A] transition-colors overflow-hidden",
          className
        )}
      >
        <div className="px-3 py-2 flex items-center justify-between bg-[#F4F7F3] border-b border-[#D0D5DD]">
          <span className="eyebrow text-[#667085] truncate">{match.competition || "FIFAYITI 2026"}</span>
          {isLive ? (
            <LiveBadge size="sm" variant="green" />
          ) : (
            <span className="meta font-bold text-[#084C2A] tnum">{fmtTime(match.kickoff)}</span>
          )}
        </div>
        <div className="px-3 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {home.logoUrl ? (
              <img src={home.logoUrl} alt={home.name} className="w-5 h-5 object-contain" />
            ) : (
              <TeamCrest teamId={home.id} shortName={home.shortName} primary={home.primaryColor} secondary={home.secondaryColor} size="xs" />
            )}
            <span className="body-sm font-bold text-[#101828] truncate">{home.name}</span>
          </div>
          <div className="text-center">
            {(isLive || isFinished) ? (
              <span className="score text-xl text-[#101828]">
                {match.homeScore}<span className="text-[#667085]/40 mx-0.5">—</span>{match.awayScore}
              </span>
            ) : (
              <span className="eyebrow text-[#667085]">vs</span>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end min-w-0">
            <span className="body-sm font-bold text-[#101828] truncate">{away.name}</span>
            {away.logoUrl ? (
              <img src={away.logoUrl} alt={away.name} className="w-5 h-5 object-contain" />
            ) : (
              <TeamCrest teamId={away.id} shortName={away.shortName} primary={away.primaryColor} secondary={away.secondaryColor} size="xs" />
            )}
          </div>
        </div>
      </button>
    );
  }

  // ─── HERO ───
  if (variant === "hero") {
    return (
      <button
        onClick={openMatch}
        className={cn(
          "block w-full text-left rounded-xl overflow-hidden bg-pitch-texture border border-fifayiti-line hover:border-[#F4C400]/60 transition-colors",
          className
        )}
        style={{ boxShadow: "0 10px 40px -10px rgba(0,0,0,0.3)" }}
      >
        <div className="px-5 py-3 flex items-center justify-between bg-[#053319] border-b border-fifayiti-line">
          {isLive ? <LiveBadge variant="yellow" /> : (
            <span className="eyebrow text-white/55">{isFinished ? "Fini" : fmtKickoff(match.kickoff)}</span>
          )}
          <span className="eyebrow text-white/50 truncate ml-2">{match.competition || "FIFAYITI 2026"}</span>
        </div>

        <div className="px-6 py-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            {home.logoUrl ? (
              <img src={home.logoUrl} alt={home.name} className="w-14 h-14 object-contain" />
            ) : (
              <TeamCrest teamId={home.id} shortName={home.shortName} primary={home.primaryColor} secondary={home.secondaryColor} size="md" />
            )}
            <span className="body-sm font-bold text-white uppercase tracking-tight">{home.name}</span>
          </div>

          <div className="text-center">
            {isLive || isFinished ? (
              <div className="score text-5xl md:text-7xl text-white">
                {match.homeScore}
                <span className="text-white/25 mx-1 md:mx-2">—</span>
                {match.awayScore}
              </div>
            ) : (
              <div className="text-center">
                <div className="score text-4xl md:text-5xl text-white tnum">{fmtTime(match.kickoff)}</div>
                <div className="meta text-white/60 mt-2">{fmtKickoff(match.kickoff)}</div>
              </div>
            )}
            {isLive && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F4C400] text-[#084C2A]">
                <span className="eyebrow tnum">{match.clock ?? 0}'</span>
                <span className="text-xs">·</span>
                <span className="text-xs font-bold">{halfLabel}</span>
              </div>
            )}
            {isFinished && (
              <div className="mt-3 eyebrow text-[#F4C400]">Fen match</div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            {away.logoUrl ? (
              <img src={away.logoUrl} alt={away.name} className="w-14 h-14 object-contain" />
            ) : (
              <TeamCrest teamId={away.id} shortName={away.shortName} primary={away.primaryColor} secondary={away.secondaryColor} size="md" />
            )}
            <span className="body-sm font-bold text-white uppercase tracking-tight">{away.name}</span>
          </div>
        </div>

        <div className="px-5 py-3 bg-[#053319] border-t border-fifayiti-line flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/70 min-w-0">
            <MapPin size={12} />
            <span className="meta truncate">{match.venue || "—"}</span>
          </div>
          <span className="body-sm font-bold text-[#F4C400] inline-flex items-center gap-1">
            {isLive ? (
              <><Play size={12} fill="#F4C400" /> Gade match la</>
            ) : isFinished ? (
              <><Radio size={12} /> Wè rezime a</>
            ) : (
              <>Gade detay</>
            )}
          </span>
        </div>
      </button>
    );
  }

  // ─── CARD (default for upcoming matches grid) ───
  return (
    <button
      onClick={openMatch}
      className={cn(
        "group flex flex-col gap-3 rounded-xl bg-white border border-[#D0D5DD] p-4 hover:border-[#116B3A] hover:shadow-md transition-all text-left",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[#667085] truncate">{match.competition || "FIFAYITI 2026"}</span>
        {isLive ? (
          <LiveBadge size="sm" variant="green" />
        ) : (
          <span className="text-sm font-bold text-[#084C2A] tnum">{fmtTime(match.kickoff)}</span>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-2.5">
        <FixtureRow team={home} score={isLive || isFinished ? match.homeScore : null} />
        <FixtureRow team={away} score={isLive || isFinished ? match.awayScore : null} />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-[#D0D5DD]">
        <span className="meta text-[#667085] truncate">
          {isLive ? "An dirèk" : (match.venue || fmtKickoff(match.kickoff))}
        </span>
        {isLive ? (
          <span className="meta font-bold text-[#116B3A] tnum">{match.clock ?? 0}'</span>
        ) : (
          <span className="meta font-bold text-[#116B3A] group-hover:underline">Gade detay →</span>
        )}
      </div>
    </button>
  );
}

function FixtureRow({ team, score }: { team: TeamLike; score: number | null }) {
  return (
    <div className="flex items-center gap-3">
      {team.logoUrl ? (
        <img src={team.logoUrl} alt={team.name} className="w-5 h-5 object-contain" />
      ) : (
        <TeamCrest
          teamId={team.id}
          shortName={team.shortName}
          primary={team.primaryColor}
          secondary={team.secondaryColor}
          size="xs"
        />
      )}
      <span className="font-bold text-base text-[#101828] flex-1 truncate">{team.name}</span>
      {score !== null && <span className="score text-2xl text-[#101828]">{score}</span>}
    </div>
  );
}
