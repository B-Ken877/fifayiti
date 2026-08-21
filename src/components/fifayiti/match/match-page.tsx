"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { TeamCrest } from "../team-crest";
import { LiveBadge } from "../live-badge";
import { MatchCard } from "../public/match-card";
import { ReplayCard } from "../public/replay-card";
import { cn } from "@/lib/utils";
import { Activity, BarChart3, Users, Play, MessageCircle, ArrowLeft, Megaphone } from "lucide-react";

type Tab = "aksyon" | "estatistik" | "ekip" | "replay" | "kòmantè";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
  players?: any[];
}

interface MatchEvent {
  id: string;
  minute: number;
  half: number;
  kind: string;
  teamId?: string | null;
  playerInId?: string | null;
  playerOutId?: string | null;
  description: string;
  recordedBy: string;
  recordedAt: string;
}

interface MatchData {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string;
  venue?: string | null;
  competition?: string;
  status: string;
  referee?: string | null;
  commissioner?: string | null;
  clock?: number;
  half?: string;
  events: MatchEvent[];
  replayIds: string[];
}

export function MatchPage() {
  const { activeMatchId, setView, setActiveMatchId } = useAppStore();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [home, setHome] = useState<TeamData | null>(null);
  const [away, setAway] = useState<TeamData | null>(null);
  const [otherMatches, setOtherMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("aksyon");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const matchesRes = await fetch("/api/matches");
        const matchesData = await matchesRes.json();
        const all = matchesData.matches as MatchData[];

        // Try the active match, then any live match, then any upcoming, then nothing
        let target: MatchData | undefined =
          all.find((m) => m.id === activeMatchId)
          ?? all.find((m) => m.status === "AN_DIRÈK")
          ?? all.find((m) => m.status === "PWOGRAM")
          ?? all[0];

        if (!target) {
          setMatch(null);
          setHome(null);
          setAway(null);
          setOtherMatches([]);
          return;
        }

        setMatch(target);
        setActiveMatchId(target.id);

        const [homeRes, awayRes] = await Promise.all([
          fetch(`/api/teams/${target.homeTeamId}`).then((r) => r.json()),
          fetch(`/api/teams/${target.awayTeamId}`).then((r) => r.json()),
        ]);
        setHome(homeRes.team ?? null);
        setAway(awayRes.team ?? null);

        setOtherMatches(all.filter((m) => m.id !== target.id).slice(0, 3));
      } catch {}
      finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId]);

  if (loading) {
    return (
      <div className="bg-white min-h-[60vh] flex items-center justify-center">
        <p className="body-md text-[#667085]">Ap charger match la...</p>
      </div>
    );
  }

  if (!match || !home || !away) {
    return (
      <div className="bg-white min-h-[60vh] flex flex-col items-center justify-center p-8">
        <Megaphone size={32} className="text-[#E4E7EC]" />
        <p className="mt-3 font-bold text-[#084C2A]">Pa gen match pou kounye a</p>
        <p className="meta text-[#667085] mt-1">
          Prezidan ap pwogram match yo. Tounen pita.
        </p>
        <button onClick={() => setView("home")} className="mt-4 btn-primary">
          <ArrowLeft size={14} /> Retounen akèy
        </button>
      </div>
    );
  }

  const isLive = match.status === "AN_DIRÈK";
  const isFinished = match.status === "FINI";

  const halfLabel = match.half === "1" ? "1ye mitan"
    : match.half === "2" ? "2yèm mitan"
    : match.half === "HT" ? "Mwatye tan"
    : "";

  const fmtKickoff = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
        " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <div className="bg-white min-h-[60vh]">
      {/* SCOREBOARD */}
      <div className="bg-pitch-texture-dark text-white border-b border-[#053319]">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 lg:py-12">
          <div className="flex items-center justify-between mb-6">
            <span className="eyebrow text-white/55">{match.competition || "FIFAYITI 2026"}</span>
            {isLive ? (
              <LiveBadge variant="yellow" />
            ) : (
              <span className="meta font-bold text-white/80">
                {isFinished ? "Fini" : fmtKickoff(match.kickoff)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
            <button
              onClick={() => {
                setActiveTeamId(home.id);
                setView("team-detail");
              }}
              className="flex flex-col items-center gap-3 text-center"
            >
              {home.logoUrl ? (
                <img src={home.logoUrl} alt={home.name} className="w-16 h-16 object-contain" />
              ) : (
                <TeamCrest
                  teamId={home.id}
                  shortName={home.shortName}
                  primary={home.primaryColor}
                  secondary={home.secondaryColor}
                  size="lg"
                />
              )}
              <span className="heading-md font-bold text-white uppercase">{home.name}</span>
            </button>

            <div className="text-center">
              <div className="score text-5xl md:text-7xl text-white">
                {match.homeScore}
                <span className="text-white/25 mx-1 md:mx-3">—</span>
                {match.awayScore}
              </div>
              {isLive ? (
                <div className="mt-3 inline-flex items-center px-3 py-1.5 rounded-full bg-[#F4C400] text-[#084C2A]">
                  <span className="eyebrow tnum">{match.clock ?? 0}'</span>
                  <span className="text-xs mx-1.5">·</span>
                  <span className="text-xs font-bold">{halfLabel}</span>
                </div>
              ) : isFinished ? (
                <div className="mt-3 eyebrow text-[#F4C400]">Fen match</div>
              ) : (
                <div className="mt-3 meta font-bold text-white/70 tnum">{fmtKickoff(match.kickoff)}</div>
              )}
            </div>

            <button
              onClick={() => {
                setActiveTeamId(away.id);
                setView("team-detail");
              }}
              className="flex flex-col items-center gap-3 text-center"
            >
              {away.logoUrl ? (
                <img src={away.logoUrl} alt={away.name} className="w-16 h-16 object-contain" />
              ) : (
                <TeamCrest
                  teamId={away.id}
                  shortName={away.shortName}
                  primary={away.primaryColor}
                  secondary={away.secondaryColor}
                  size="lg"
                />
              )}
              <span className="heading-md font-bold text-white uppercase">{away.name}</span>
            </button>
          </div>

          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info label="Teren" value={match.venue || "—"} />
            <Info label="Orè" value={fmtKickoff(match.kickoff)} />
            <Info label="Abit" value={match.referee || "—"} />
            <Info label="Komisè" value={match.commissioner || "—"} />
          </div>

          {isLive && (
            <button onClick={() => setView("tv")} className="mt-6 btn-featured">
              <Play size={16} fill="#084C2A" /> Gade match la
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[76px] z-30 bg-white border-b border-[#D0D5DD]">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-1 overflow-x-auto">
            <TabBtn active={tab === "aksyon"} onClick={() => setTab("aksyon")} icon={Activity} label="Aksyon" />
            <TabBtn active={tab === "estatistik"} onClick={() => setTab("estatistik")} icon={BarChart3} label="Estatistik" />
            <TabBtn active={tab === "ekip"} onClick={() => setTab("ekip")} icon={Users} label="Ekip" />
            <TabBtn active={tab === "replay"} onClick={() => setTab("replay")} icon={Play} label="Replay" />
            <TabBtn active={tab === "kòmantè"} onClick={() => setTab("kòmantè")} icon={MessageCircle} label="Kòmantè" />
          </div>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8">
        {tab === "aksyon" && <AksyonTab match={match} home={home} away={away} />}
        {tab === "estatistik" && <EstatistikTab match={match} home={home} away={away} />}
        {tab === "ekip" && <EkipTab home={home} away={away} />}
        {tab === "replay" && <ReplayTab match={match} />}
        {tab === "kòmantè" && <KòmantèTab match={match} />}
      </div>

      {/* Other matches */}
      {otherMatches.length > 0 && (
        <section className="bg-[#F4F7F3] border-t border-[#D0D5DD]">
          <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10">
            <div className="flex items-end justify-between mb-4">
              <h2 className="heading-lg text-[#101828]">Lòt match yo</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherMatches.map((m) => (
                <MatchCard key={m.id} match={m as any} variant="compact" />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-fifayiti-line px-3 py-2 min-w-0">
      <p className="eyebrow text-white/45 truncate">{label}</p>
      <p className="body-sm font-semibold text-white truncate mt-0.5">{value}</p>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-3 body-sm font-semibold -mb-px border-b-2 transition-colors whitespace-nowrap",
        active ? "border-[#F4C400] text-[#116B3A]" : "border-transparent text-[#667085] hover:text-[#101828]"
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function AksyonTab({ match, home, away }: { match: MatchData; home: TeamData; away: TeamData }) {
  const events = match.events ?? [];
  if (events.length === 0) {
    return <EmptyState text="Pa gen aksyon ankè. Match la poko kòmanse oswa pa gen done enregistre." />;
  }
  const sorted = events.slice().sort((a, b) => (a.half - b.half) || (a.minute - b.minute));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#D0D5DD] -translate-x-1/2" />
        <div className="space-y-3">
          {sorted.map((ev) => {
            const team = ev.teamId === home.id ? home : ev.teamId === away.id ? away : undefined;
            const isHome = team?.id === home.id;
            const isGoal = ev.kind === "GOL";
            const isYellow = ev.kind === "KAT_JON";
            const isRed = ev.kind === "KAT_WOUJ";
            const isSub = ev.kind === "RANPLASMAN";
            const icon = isGoal ? "⚽" : isYellow ? "🟨" : isRed ? "🟥" : isSub ? "🔄" : "•";
            return (
              <div key={ev.id} className={cn("relative flex items-center gap-3", isHome ? "flex-row" : "flex-row-reverse")}>
                <div className={cn("flex-1", isHome ? "text-right" : "text-left")}>
                  <div
                    className={cn(
                      "inline-block rounded-lg px-4 py-2.5 border",
                      isGoal ? "bg-[#116B3A]/8 border-[#116B3A]/30" : "fifayiti-card"
                    )}
                  >
                    <div className="flex items-center gap-2 body-sm" style={{ flexDirection: isHome ? "row-reverse" : "row" }}>
                      <span className="text-lg">{icon}</span>
                      <div>
                        <p className={cn("body-sm font-bold", isGoal ? "text-[#116B3A]" : "text-[#101828]")}>
                          {ev.description}
                        </p>
                        <p className="meta text-[#667085] mt-0.5">
                          {team?.name} · {ev.minute}'
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 w-9 h-9 rounded-full bg-white border-2 border-[#116B3A] flex items-center justify-center text-xs font-bold text-[#116B3A] tnum shrink-0">
                  {ev.minute}
                </div>
                <div className="flex-1" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EstatistikTab({ match, home, away }: { match: MatchData; home: TeamData; away: TeamData }) {
  const events = match.events ?? [];
  const homeGoals = events.filter((e) => e.kind === "GOL" && e.teamId === home.id).length;
  const awayGoals = events.filter((e) => e.kind === "GOL" && e.teamId === away.id).length;
  const homeYellow = events.filter((e) => e.kind === "KAT_JON" && e.teamId === home.id).length;
  const awayYellow = events.filter((e) => e.kind === "KAT_JON" && e.teamId === away.id).length;
  const homeRed = events.filter((e) => e.kind === "KAT_WOUJ" && e.teamId === home.id).length;
  const awayRed = events.filter((e) => e.kind === "KAT_WOUJ" && e.teamId === away.id).length;

  const derivedStats = [
    { label: "Gòl", home: homeGoals, away: awayGoals },
    { label: "Kat jòn", home: homeYellow, away: awayYellow },
    { label: "Kat wouj", home: homeRed, away: awayRed },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TeamCrest teamId={home.id} shortName={home.shortName} primary={home.primaryColor} secondary={home.secondaryColor} size="sm" />
          <span className="body-sm font-bold text-[#101828]">{home.shortName}</span>
        </div>
        <span className="eyebrow text-[#667085]">Estatistik ofisyèl</span>
        <div className="flex items-center gap-2">
          <span className="body-sm font-bold text-[#101828]">{away.shortName}</span>
          <TeamCrest teamId={away.id} shortName={away.shortName} primary={away.primaryColor} secondary={away.secondaryColor} size="sm" />
        </div>
      </div>

      <div className="space-y-3">
        {derivedStats.map((s) => {
          const total = s.home + s.away || 1;
          const homePct = (s.home / total) * 100;
          const awayPct = 100 - homePct;
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between body-sm font-bold mb-1">
                <span className="text-[#101828] tnum">{s.home}</span>
                <span className="eyebrow text-[#667085]">{s.label}</span>
                <span className="text-[#101828] tnum">{s.away}</span>
              </div>
              <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-[#F4F7F3]">
                <div className="h-full bg-[#116B3A]" style={{ width: `${homePct}%` }} />
                <div className="h-full bg-[#F4C400]" style={{ width: `${awayPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg bg-[#F4F7F3] border border-[#D0D5DD] p-4">
        <p className="meta text-[#667085]">
          Estatistik detaye (posesyon, tiret, kònen fou) pa disponib poko.
        </p>
      </div>
    </div>
  );
}

function EkipTab({ home, away }: { home: TeamData; away: TeamData }) {
  const homeRoster = (home.players ?? []).slice(0, 11);
  const awayRoster = (away.players ?? []).slice(0, 11);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {[{ team: home, roster: homeRoster }, { team: away, roster: awayRoster }].map(({ team, roster }) => (
        <div key={team.id}>
          <div className="flex items-center gap-2 mb-3">
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={team.name} className="w-6 h-6 object-contain" />
            ) : (
              <TeamCrest teamId={team.id} shortName={team.shortName} primary={team.primaryColor} secondary={team.secondaryColor} size="sm" />
            )}
            <h3 className="body-sm font-bold text-[#101828]">{team.name}</h3>
          </div>
          {roster.length === 0 ? (
            <div className="fifayiti-card border-dashed p-6 text-center body-sm text-[#667085]">
              Pa gen jwè nan roste a poko.
            </div>
          ) : (
            <ul className="fifayiti-card rounded-xl overflow-hidden">
              {roster.map((p: any) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 border-b border-[#D0D5DD] last:border-b-0">
                  <span
                    className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold tnum"
                    style={{ background: team.primaryColor, color: team.secondaryColor }}
                  >
                    {p.jerseyNumber}
                  </span>
                  <span className="body-sm font-semibold text-[#101828] flex-1 truncate">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="eyebrow text-[#667085] bg-[#F4F7F3] px-1.5 py-0.5 rounded">{p.position}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ReplayTab({ match }: { match: MatchData }) {
  return <EmptyState text="Pa gen replay sove pou match sa a poko." />;
}

function KòmantèTab({ match }: { match: MatchData }) {
  const events = (match.events ?? []).slice().sort((a, b) => (b.half - a.half) || (b.minute - a.minute));
  if (events.length === 0) {
    return <EmptyState text="Kòmantè ap parèt la a pandan match la." />;
  }
  return (
    <div className="max-w-2xl mx-auto fifayiti-card rounded-xl p-4 space-y-3 max-h-[600px] overflow-y-auto">
      {events.map((ev) => (
        <div key={ev.id} className="flex gap-3">
          <span className="w-10 h-10 rounded-full bg-[#F4F7F3] flex items-center justify-center text-xs font-bold text-[#084C2A] tnum shrink-0">
            {ev.minute}'
          </span>
          <div className="flex-1 min-w-0">
            <p className="body-sm font-semibold text-[#101828]">{ev.description}</p>
            <p className="meta text-[#667085] mt-0.5">Kòmantatè FIFAYITI TV</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12">
      <p className="body-sm text-[#667085]">{text}</p>
    </div>
  );
}
