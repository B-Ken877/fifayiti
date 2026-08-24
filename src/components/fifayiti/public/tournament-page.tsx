"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Trophy, Calendar, Users, ChevronRight, MapPin,
  Crown, ShieldCheck, Goal, ArrowLeft, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
}

interface GroupData {
  id: string;
  name: string;
  teams: Array<{ teamId: string; team: TeamData; seedNumber: number }>;
}

interface MatchData {
  id: string;
  matchday: number;
  stage: string;
  groupLabel?: string | null;
  bracketSlot?: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string;
  venue?: string | null;
  competitionName?: string;
  status: string;
  clock?: number;
  half?: string;
}

interface CompetitionData {
  id: string;
  name: string;
  slug: string;
  season: string;
  status: string;
  format: string;
  rrType: string;
  groupCount: number;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  hasThirdPlaceMatch: boolean;
  hasKnockoutPhase: boolean;
  startDate?: string | null;
  endDate?: string | null;
  groups: GroupData[];
  matches?: MatchData[];
}

interface TeamRecord {
  teamId: string;
  teamName: string;
  teamShortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface StandingsResponse {
  groups: Array<{
    id: string;
    name: string;
    teams: TeamRecord[];
  }>;
}

interface BracketResponse {
  bracket: {
    size: number;
    totalRounds: number;
    rounds: Array<{
      round: number;
      stage: string;
      label: string;
      matches: Array<{
        slot: string;
        status: string;
        match?: MatchData & { homeTeam?: TeamData; awayTeam?: TeamData };
      }>;
    }>;
    groupQualifiersPerGroup: number;
    groupCount: number;
  } | null;
  message?: string;
}

export function TournamentPage() {
  const { setView, setActiveMatchId } = useAppStore();
  const [competitions, setCompetitions] = useState<CompetitionData[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [competition, setCompetition] = useState<CompetitionData | null>(null);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [bracket, setBracket] = useState<BracketResponse | null>(null);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial load: competition list + which one is active
  useEffect(() => {
    (async () => {
      try {
        const [listRes, activeRes] = await Promise.all([
          fetch("/api/competitions").then((r) => r.json()),
          fetch("/api/competitions/active").then((r) => r.json()),
        ]);
        const list = (listRes.competitions ?? []) as CompetitionData[];
        setCompetitions(list);
        const active = activeRes.competition as CompetitionData | null;
        const initial = active?.id ?? list[0]?.id ?? "";
        if (initial) setSelectedId(initial);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  // Load (and live-poll) the selected competition's structure. Everything the
  // admin does in the bracket manager appears here within a few seconds.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [compRes, standingsRes, bracketRes, matchesRes] = await Promise.all([
          fetch(`/api/competitions/${selectedId}`).then((r) => r.json()),
          fetch(`/api/competitions/${selectedId}/standings`).then((r) => r.json()),
          fetch(`/api/competitions/${selectedId}/bracket`).then((r) => r.json()),
          fetch(`/api/matches?competitionId=${selectedId}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setCompetition(compRes.competition ?? null);
        setStandings(standingsRes);
        setBracket(bracketRes);
        setMatches(matchesRes.matches ?? []);
      } catch {}
    };
    load();
    const i = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(i); };
  }, [selectedId]);

  // Group-stage matches (the knockout matches are shown in the bracket)
  const groupMatches = matches.filter((m) => m.stage === "GROUP");

  // Champion — winner of the final, when played
  let champion: TeamData | null = null;
  for (const round of bracket?.bracket?.rounds ?? []) {
    if (round.stage !== "FIN") continue;
    for (const m of round.matches) {
      const mm = m.match;
      if (mm && mm.status === "FINI") {
        if (mm.homeScore > mm.awayScore && mm.homeTeam) champion = mm.homeTeam;
        else if (mm.awayScore > mm.homeScore && mm.awayTeam) champion = mm.awayTeam;
      }
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-[60vh] flex items-center justify-center">
        <p className="body-md text-[#667085]">Ap charger tounwa a...</p>
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="bg-white min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <Trophy size={40} className="text-[#E4E7EC]" />
        <p className="mt-3 font-bold text-[#084C2A]">Pa gen konpetisyon aktif</p>
        <p className="meta text-[#667085] mt-1 max-w-md">
          Prezidan ap prepare konpetisyon an. Tounwa a ap parèt isit lè li pare.
        </p>
        <button onClick={() => setView("home")} className="mt-4 btn-secondary">
          <ArrowLeft size={14} /> Retounen akèy
        </button>
      </div>
    );
  }

  const statusLabel =
    competition.status === "DRAFT" ? "Brouiyon"
    : competition.status === "OPEN" ? "Enskripsyon ouvè"
    : competition.status === "IN_PROGRESS" ? "An kou"
    : competition.status === "COMPLETED" ? "Fini"
    : "Archive";

  const statusTone =
    competition.status === "IN_PROGRESS" ? { bg: "#116B3A", fg: "#FFFFFF" }
    : competition.status === "COMPLETED" ? { bg: "#667085", fg: "#FFFFFF" }
    : competition.status === "OPEN" ? { bg: "#F4C400", fg: "#084C2A" }
    : { bg: "#E4E7EC", fg: "#667085" };

  const fmtDate = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
  };

  return (
    <div className="bg-white min-h-[60vh]">
      {/* ═══ HERO ═══ */}
      <section
        className="relative overflow-hidden text-white border-b border-fifayiti-line"
        style={{ background: "linear-gradient(135deg, #084C2A 0%, #116B3A 60%, #053319 100%)" }}
      >
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <div className="flex items-center gap-3 mb-3">
            <Trophy size={18} className="text-[#F4C400]" />
            <span className="eyebrow text-[#F4C400]">FIFAYITI · Sezon {competition.season}</span>
          </div>
          <h1 className="display-lg text-white">{competition.name}</h1>

          {/* Championship selector — visible when several championships exist */}
          {competitions.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="eyebrow text-white/50">Konpetisyon:</span>
              {competitions.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "eyebrow px-2.5 py-1 rounded-md transition-all",
                      active
                        ? "bg-[#F4C400] text-[#084C2A]"
                        : "bg-white/15 text-white hover:bg-white/25"
                    )}
                  >
                    {c.name}
                    {c.status === "IN_PROGRESS" && !active && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D92D20] ml-1.5 align-middle" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className="eyebrow px-2.5 py-1 rounded-md"
              style={{ background: statusTone.bg, color: statusTone.fg }}
            >
              {statusLabel}
            </span>
            <span className="eyebrow px-2.5 py-1 rounded-md bg-white/15 text-white">
              <Calendar size={11} className="inline mr-1" />
              {fmtDate(competition.startDate)} → {fmtDate(competition.endDate)}
            </span>
            <span className="eyebrow px-2.5 py-1 rounded-md bg-white/15 text-white">
              <Users size={11} className="inline mr-1" />
              {competition.groupCount} gwoup · {competition.teamsPerGroup} ekip chak
            </span>
            {competition.hasKnockoutPhase && (
              <span className="eyebrow px-2.5 py-1 rounded-md bg-[#F4C400] text-[#084C2A]">
                <Crown size={11} className="inline mr-1" />
                Faz Eliminatwa
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 lg:py-12 space-y-12">
        {/* ═══ CHAMPION ═══ */}
        {champion && (
          <section
            className="rounded-2xl border-2 border-[#F4C400] p-5 md:p-6 flex flex-col sm:flex-row items-center gap-4"
            style={{ background: "linear-gradient(135deg, #084C2A 0%, #116B3A 100%)" }}
          >
            <div className="w-14 h-14 rounded-2xl bg-[#F4C400] flex items-center justify-center shrink-0">
              <Crown size={26} className="text-[#084C2A]" />
            </div>
            <div className="text-center sm:text-left">
              <p className="eyebrow text-[#F4C400]">Chanpyon · {competition.season}</p>
              <p className="heading-xl text-white mt-1">{champion.name}</p>
              <p className="body-sm text-white/60 mt-1">
                {champion.shortName.toUpperCase()} — genyen final la.
              </p>
            </div>
          </section>
        )}

        {/* ═══ GROUP STANDINGS ═══ */}
        {standings && standings.groups && (
          <section>
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="eyebrow text-[#116B3A]">Faz gwoup</span>
                <h2 className="heading-xl text-[#101828] mt-2">Klasman gwoup yo</h2>
                <p className="body-sm text-[#667085] mt-2">
                  {competition.qualifiersPerGroup} premye ekip nan chak gwoup avanse nan faz eliminatwa a.
                </p>
              </div>
            </div>
            <div className={cn(
              "grid gap-6",
              competition.groupCount === 1 ? "grid-cols-1" : "lg:grid-cols-2"
            )}>
              {standings.groups.map((g) => (
                <GroupStandingsCard
                  key={g.id}
                  group={g}
                  qualifiersPerGroup={competition.qualifiersPerGroup}
                  onTeamClick={(teamId) => {
                    useAppStore.getState().setActiveTeamId(teamId);
                    setView("team-detail");
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* ═══ KNOCKOUT BRACKET ═══ */}
        {bracket?.bracket && (
          <section>
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="eyebrow text-[#116B3A]">Faz eliminatwa</span>
                <h2 className="heading-xl text-[#101828] mt-2">Tablo</h2>
                <p className="body-sm text-[#667085] mt-2">
                  {bracket.bracket.size} ekip · {bracket.bracket.totalRounds} tou.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="flex gap-4 lg:gap-6 min-w-max pb-2">
                {bracket.bracket.rounds.map((round) => (
                  <div key={round.round} className="min-w-[220px] lg:min-w-[260px]">
                    <div className="mb-3 sticky top-0">
                      <p className="eyebrow text-[#667085]">{round.label}</p>
                    </div>
                    <div className="space-y-3">
                      {round.matches.map((m) => (
                        <BracketSlot
                          key={m.slot}
                          slot={m.slot}
                          status={m.status}
                          match={m.match}
                          onClick={() => {
                            if (m.match) {
                              setActiveMatchId(m.match.id);
                              setView("match");
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ SCHEDULE (GROUP MATCHES) ═══ */}
        {groupMatches.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="eyebrow text-[#116B3A]">Pwogram match</span>
                <h2 className="heading-xl text-[#101828] mt-2">Match faz gwoup yo</h2>
                <p className="body-sm text-[#667085] mt-2">
                  {groupMatches.length} match pou {competition.name}.
                </p>
              </div>
            </div>

            {/* Group matches grouped by matchday */}
            <div className="space-y-6">
              {Array.from(new Set(groupMatches.map((m) => m.matchday)))
                .sort((a, b) => a - b)
                .map((md) => (
                  <div key={md}>
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar size={14} className="text-[#116B3A]" />
                      <span className="eyebrow text-[#116B3A]">Joumatch {md}</span>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {groupMatches
                        .filter((m) => m.matchday === md)
                        .map((m) => (
                          <ScheduleRow
                            key={m.id}
                            match={m}
                            teams={competition.groups?.flatMap((g) => g.teams.map((t) => t.team)) ?? []}
                            onClick={() => {
                              setActiveMatchId(m.id);
                              setView("match");
                            }}
                          />
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function GroupStandingsCard({
  group, qualifiersPerGroup, onTeamClick,
}: {
  group: { id: string; name: string; teams: TeamRecord[] };
  qualifiersPerGroup: number;
  onTeamClick: (teamId: string) => void;
}) {
  return (
    <div className="fifayiti-card overflow-hidden">
      <div className="px-5 py-3 bg-[#F4F7F3] border-b border-[#D0D5DD] flex items-center justify-between">
        <span className="eyebrow text-[#084C2A]">Gwoup {group.name}</span>
        <span className="meta text-[#667085]">{group.teams.length} ekip</span>
      </div>
      {group.teams.length === 0 ? (
        <div className="p-6 text-center body-sm text-[#667085]">
          Pa gen ekip nan gwoup sa a poko.
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="eyebrow text-[#667085] bg-[#F4F7F3]">
              <th className="py-2 px-3 text-left font-semibold">Pos</th>
              <th className="py-2 px-3 text-left font-semibold">Ekip</th>
              <th className="py-2 px-1 text-center font-semibold">J</th>
              <th className="py-2 px-1 text-center font-semibold">G</th>
              <th className="py-2 px-1 text-center font-semibold">N</th>
              <th className="py-2 px-1 text-center font-semibold">P</th>
              <th className="py-2 px-3 text-right font-semibold">PTS</th>
            </tr>
          </thead>
          <tbody>
            {group.teams.map((r, idx) => {
              const pos = idx + 1;
              const qualifies = pos <= qualifiersPerGroup;
              return (
                <tr
                  key={r.teamId}
                  className="border-t border-[#D0D5DD] hover:bg-[#F4F7F3] cursor-pointer transition-colors"
                  onClick={() => onTeamClick(r.teamId)}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {qualifies && (
                        <span
                          className="w-[3px] h-6 rounded-full"
                          style={{ background: "#F4C400" }}
                          aria-label="Zòn kalifikasyon"
                        />
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-7 h-7 rounded-md text-sm tnum font-bold",
                          pos === 1
                            ? "bg-[#F4C400] text-[#084C2A]"
                            : qualifies
                            ? "bg-[#116B3A]/10 text-[#116B3A]"
                            : "text-[#667085]"
                        )}
                      >
                        {pos}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {r.logoUrl ? (
                        <img src={r.logoUrl} alt={r.teamName} className="w-6 h-6 object-contain" />
                      ) : (
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
                          style={{ background: r.primaryColor, color: r.secondaryColor }}
                        >
                          {r.teamShortName.slice(0, 3).toUpperCase()}
                        </div>
                      )}
                      <span className="body-sm font-bold text-[#101828] truncate">{r.teamName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-1 text-center body-sm font-semibold text-[#667085] tnum">{r.played}</td>
                  <td className="py-3 px-1 text-center body-sm font-bold text-[#116B3A] tnum">{r.won}</td>
                  <td className="py-3 px-1 text-center body-sm font-semibold text-[#667085] tnum">{r.drawn}</td>
                  <td className="py-3 px-1 text-center body-sm font-semibold text-[#D92D20] tnum">{r.lost}</td>
                  <td className="py-3 px-3 text-right">
                    <span className="score text-lg text-[#101828]">{r.points}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BracketSlot({
  slot, status, match, onClick,
}: {
  slot: string;
  status: string;
  match?: MatchData & { homeTeam?: TeamData; awayTeam?: TeamData };
  onClick: () => void;
}) {
  if (status === "pending" || !match) {
    const [stage] = slot.split("-");
    const pendingText =
      stage === "THIRD_PLACE" ? "Tann pèdè demifinal yo"
      : stage === "QF" || stage === "R16" || stage === "R32" ? "Tann rezilta gwoup yo"
      : "Tann gayan tur presedan an";
    return (
      <div
        className="rounded-lg border border-dashed border-[#D0D5DD] bg-[#F4F7F3] p-3 text-center"
        style={{ minHeight: 80 }}
      >
        <p className="meta text-[#667085]">{pendingText}</p>
        <p className="eyebrow text-[#98A2B3] mt-1">{slot}</p>
      </div>
    );
  }

  const home = match.homeTeam;
  const away = match.awayTeam;
  const isLive = match.status === "AN_DIRÈK";
  const isFinished = match.status === "FINI";
  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;
  const isFinal = slot.startsWith("FIN");

  const fmtKick = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
        " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border bg-white p-3 transition-all hover:shadow-md",
        isLive ? "border-[#F4C400]" : "border-[#D0D5DD] hover:border-[#116B3A]"
      )}
      style={{ minHeight: 80 }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="eyebrow text-[#667085]">{match.competitionName || "FIFAYITI"}</span>
        {isLive ? (
          <span className="eyebrow text-[#D92D20]">● Live</span>
        ) : isFinished && isFinal ? (
          <span className="eyebrow text-[#F4C400]">★ Final jwe</span>
        ) : (
          <span className="meta text-[#98A2B3] tnum">{fmtKick(match.kickoff)}</span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {home?.logoUrl ? (
              <img src={home.logoUrl} alt={home.name} className="w-5 h-5 object-contain" />
            ) : (
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold"
                style={{ background: home?.primaryColor ?? "#666", color: home?.secondaryColor ?? "#fff" }}
              >
                {(home?.shortName ?? "?").slice(0, 3).toUpperCase()}
              </div>
            )}
            <span className={cn(
              "body-sm truncate",
              homeWon ? "font-bold text-[#101828]" : "text-[#667085]"
            )}>
              {home?.name ?? "TBD"}
            </span>
            {homeWon && isFinal && <Crown size={12} className="text-[#F4C400] shrink-0" />}
          </div>
          <span className={cn("score text-lg tnum", homeWon ? "text-[#116B3A]" : "text-[#101828]")}>
            {isLive || isFinished ? match.homeScore : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {away?.logoUrl ? (
              <img src={away.logoUrl} alt={away.name} className="w-5 h-5 object-contain" />
            ) : (
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold"
                style={{ background: away?.primaryColor ?? "#666", color: away?.secondaryColor ?? "#fff" }}
              >
                {(away?.shortName ?? "?").slice(0, 3).toUpperCase()}
              </div>
            )}
            <span className={cn(
              "body-sm truncate",
              awayWon ? "font-bold text-[#101828]" : "text-[#667085]"
            )}>
              {away?.name ?? "TBD"}
            </span>
            {awayWon && isFinal && <Crown size={12} className="text-[#F4C400] shrink-0" />}
          </div>
          <span className={cn("score text-lg tnum", awayWon ? "text-[#116B3A]" : "text-[#101828]")}>
            {isLive || isFinished ? match.awayScore : "—"}
          </span>
        </div>
      </div>
    </button>
  );
}

function ScheduleRow({
  match, teams, onClick,
}: {
  match: MatchData;
  teams: TeamData[];
  onClick: () => void;
}) {
  const home = teams.find((t) => t.id === match.homeTeamId);
  const away = teams.find((t) => t.id === match.awayTeamId);
  const isLive = match.status === "AN_DIRÈK";
  const isFinished = match.status === "FINI";

  const fmtKickoff = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
        " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg bg-white border border-[#D0D5DD] p-3 hover:border-[#116B3A] hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow text-[#667085]">
          {match.groupLabel ? `Gwoup ${match.groupLabel}` : match.stage}
        </span>
        {isLive ? (
          <span className="eyebrow text-[#D92D20]">● Live</span>
        ) : (
          <span className="meta font-bold text-[#084C2A] tnum">{fmtKickoff(match.kickoff)}</span>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="body-sm font-semibold text-[#101828]">{home?.name ?? "TBD"}</span>
          <span className={cn("score text-lg tnum", isFinished && match.homeScore > match.awayScore ? "text-[#116B3A]" : "text-[#101828]")}>
            {isLive || isFinished ? match.homeScore : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="body-sm font-semibold text-[#101828]">{away?.name ?? "TBD"}</span>
          <span className={cn("score text-lg tnum", isFinished && match.awayScore > match.homeScore ? "text-[#116B3A]" : "text-[#101828]")}>
            {isLive || isFinished ? match.awayScore : "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
