"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { LiveMatchModule } from "./live-match-module";
import { MatchCard } from "./match-card";
import { StandingsTable } from "./standings-table";
import { ReplayCard } from "./replay-card";
import { LiveBadge } from "../live-badge";
import { allReplays } from "@/lib/fifayiti-data";
import { Play, Tv, ChevronRight, MapPin, Trophy } from "lucide-react";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  group: string;
  logoUrl?: string | null;
  players?: any[];
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
  group?: "A" | "B" | string | null;
  groupLabel?: string | null;
  stage?: string;
  clock?: number;
  half?: string;
}

interface CompetitionData {
  id: string;
  name: string;
  season: string;
  status: string;
  groupCount: number;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  hasKnockoutPhase: boolean;
}

export function HomePage() {
  const { setView, setActiveMatchId } = useAppStore();
  const [live, setLive] = useState<MatchData | null>(null);
  const [upcoming, setUpcoming] = useState<MatchData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [competition, setCompetition] = useState<CompetitionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [matchesRes, teamsRes, compRes] = await Promise.all([
          fetch("/api/matches").then((r) => r.json()),
          fetch("/api/teams").then((r) => r.json()),
          fetch("/api/competitions/active").then((r) => r.json()),
        ]);
        const all = (matchesRes.matches ?? []) as MatchData[];
        const liveMatch = all.find((m) => m.status === "AN_DIRÈK");
        const upcoming = all
          .filter((m) => m.status === "PWOGRAM")
          .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
        setLive(liveMatch ?? null);
        setUpcoming(upcoming);
        setTeams(teamsRes.teams ?? []);
        setCompetition(compRes.competition ?? null);
      } catch {}
      finally {
        setLoading(false);
      }
    })();
  }, []);

  const teamById = (id: string) => teams.find((t) => t.id === id);
  const replays = allReplays(); // still synchronous (empty for now)

  const watchLive = () => {
    if (live) {
      setActiveMatchId(live.id);
      setView("match");
    }
  };

  const groupA = teams.filter((t) => t.group === "A");
  const groupB = teams.filter((t) => t.group === "B");

  return (
    <div className="bg-white">
      {/* ═══ HERO ═══ */}
      <section className="bg-pitch-texture text-white relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 lg:py-20">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16 items-center">
            <div className="space-y-6 lg:space-y-8">
              <div className="flex items-center gap-3">
                <span className="eyebrow text-[#F4C400]">
                  {competition ? `${competition.name} · Sezon ${competition.season}` : "FIFAYITI 2026"}
                </span>
                <span className="h-px flex-1 max-w-16 bg-white/15" />
              </div>
              <h1 className="display-lg text-white">
                Football Ayiti <br />
                <span className="text-[#F4C400]">an ap viv.</span>
              </h1>
              <p className="body-lg text-white/70 max-w-xl">
                Swiv match yo, ekip yo, jwè yo ak tout aksyon FIFAYITI. Soti nan jwè ki nan teren an jouk nan replay ki sove pou tout tan.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {live ? (
                  <button onClick={watchLive} className="btn-featured">
                    <Play size={16} fill="#084C2A" /> Gade match la
                  </button>
                ) : (
                  <button onClick={() => setView("match")} className="btn-featured">
                    <Play size={16} fill="#084C2A" /> Gade match yo
                  </button>
                )}
                <button onClick={() => setView("tv")} className="btn-on-green">
                  <Tv size={16} strokeWidth={2.5} /> FIFAYITI TV
                </button>
              </div>
            </div>
            {live ? (
              <LiveMatchModule match={live as any} variant="hero" />
            ) : (
              <div className="fifayiti-card-dark p-8 text-center">
                <p className="body-md text-white/70">Pa gen match an dirèk kounye a.</p>
                {upcoming.length > 0 && (
                  <button
                    onClick={() => setView("match")}
                    className="mt-4 body-sm font-bold text-[#F4C400] hover:underline"
                  >
                    Gade pwochen match →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ UPCOMING FIXTURES ═══ */}
      <section className="bg-white border-b border-[#D0D5DD]">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <span className="eyebrow text-[#116B3A]">Pwogram</span>
              <h2 className="heading-xl text-[#101828] mt-2">Match kap vini yo</h2>
            </div>
            <button
              onClick={() => setView("match")}
              className="hidden md:inline-flex items-center gap-1 body-sm font-semibold text-[#667085] hover:text-[#116B3A] transition-colors"
            >
              Tout match yo <ChevronRight size={16} />
            </button>
          </div>
          {upcoming.length === 0 ? (
            <div className="py-12 text-center body-md text-[#667085]">
              Pa gen match pwograme pou kounye a. Prezidan ap pwogram yo.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.slice(0, 3).map((m) => (
                <MatchCard key={m.id} match={m as any} variant="compact" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══ STANDINGS ═══ */}
      <section className="bg-pitch-texture text-white">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <div className="grid lg:grid-cols-[1fr_2fr] gap-8 lg:gap-12 items-start">
            <div>
              <span className="eyebrow text-[#F4C400]">Sitiyasyon aktyèl</span>
              <h2 className="heading-xl text-white mt-2">Klasman</h2>
              <p className="body-sm text-white/70 mt-3 max-w-sm">
                Pozisyon ekip yo nan FIFAYITI Koup Tikan 2026 — kalkile apati rezilta match ofisyèl yo.
              </p>
              <button onClick={() => setView("standings")} className="mt-6 btn-on-green">
                Gade tout klasman →
              </button>
            </div>
            <div className="fifayiti-card p-0 overflow-hidden">
              <StandingsPanel label="Gwoup A" teams={groupA} />
              <div className="h-px bg-[#D0D5DD]" />
              <StandingsPanel label="Gwoup B" teams={groupB} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FIFAYITI TV ═══ */}
      <section className="bg-pitch-texture-dark text-white border-t border-fifayiti-line">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Tv size={18} className="text-[#F4C400]" strokeWidth={2.5} />
                <span className="eyebrow text-[#F4C400]">Broadcast</span>
              </div>
              <h2 className="heading-xl text-white">FIFAYITI TV</h2>
              <p className="body-sm text-white/60 mt-2 max-w-md">
                Tout match, replay ak pi bon aksyon yo — nan men w, kounye a.
              </p>
            </div>
            <button onClick={() => setView("tv")} className="btn-featured">
              Antre sou FIFAYITI TV
            </button>
          </div>
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
            <button
              onClick={() => setView("tv")}
              className="block text-left rounded-xl overflow-hidden fifayiti-card-dark hover:border-[#F4C400]/30 transition-colors"
            >
              <div className="aspect-video relative bg-pitch-texture-dark">
                {live && (
                  <div className="absolute top-3 left-3">
                    <LiveBadge variant="yellow" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#F4C400] flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                    <Play size={22} className="text-[#084C2A] ml-1" fill="#084C2A" />
                  </div>
                </div>
                {live && teamById(live.homeTeamId) && teamById(live.awayTeamId) && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white">
                    <div>
                      <p className="body-sm font-bold">
                        {teamById(live.homeTeamId)?.shortName} vs {teamById(live.awayTeamId)?.shortName}
                      </p>
                      <p className="meta text-white/60">{live.competition}</p>
                    </div>
                    <div className="score text-3xl text-[#F4C400]">
                      {live.homeScore} — {live.awayScore}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-fifayiti-line flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/70">
                  <MapPin size={14} className="text-[#F4C400]" />
                  <span className="body-sm">FIFAYITI pwodiksyon</span>
                </div>
                <span className="body-sm font-bold text-[#F4C400]">Gade kounye a →</span>
              </div>
            </button>

            <div>
              <h3 className="heading-md text-white mb-3">Pi bon aksyon yo</h3>
              {replays.length === 0 ? (
                <div className="fifayiti-card-dark p-6 text-center body-sm text-white/60">
                  Pa gen replay disponib.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {replays.slice(0, 4).map((r) => (
                    <ReplayCard
                      key={r.id}
                      replay={r}
                      onClick={() => {
                        setActiveMatchId(r.matchId);
                        setView("match");
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ EKIP — teams strip ═══ */}
      <section className="bg-white border-t border-[#D0D5DD]">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 lg:py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <span className="eyebrow text-[#116B3A]">Sezon 2026</span>
              <h2 className="heading-xl text-[#101828] mt-2">Ekip yo</h2>
              <p className="body-sm text-[#667085] mt-3 max-w-2xl">
                {teams.length > 0
                  ? `${teams.length} ekip ap patisipe nan FIFAYITI Koup Tikan 2026.`
                  : "Pa gen ekip enskri pou kounye a. Prezidan ap ajoute yo."}
              </p>
            </div>
            <button onClick={() => setView("teams")} className="btn-secondary">
              Tout ekip yo →
            </button>
          </div>
          {teams.length === 0 ? (
            <div className="fifayiti-card border-dashed p-10 text-center">
              <Trophy size={28} className="mx-auto text-[#E4E7EC]" />
              <p className="mt-2 body-sm font-bold text-[#101828]">Pa gen ekip pou kounye a</p>
              <p className="meta text-[#667085] mt-1">
                Ekip yo ap parèt isit lè Prezidan ajoute yo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {teams.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTeamId(t.id);
                    setView("team-detail");
                  }}
                  className="fifayiti-card p-4 flex flex-col items-center gap-3 hover:border-[#116B3A] hover:shadow-md transition-all"
                >
                  {t.logoUrl ? (
                    <img src={t.logoUrl} alt={t.name} className="w-12 h-12 object-contain" />
                  ) : (
                    <TeamCrestLocal team={t} />
                  )}
                  <div className="text-center">
                    <p className="body-sm font-bold text-[#101828]">{t.name}</p>
                    <p className="meta text-[#667085] uppercase tracking-wider mt-0.5">Gwoup {t.group}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StandingsPanel({ label, teams }: { label: string; teams: TeamData[] }) {
  return (
    <div>
      <div className="px-5 py-3 bg-[#F4F7F3] border-b border-[#D0D5DD] flex items-center justify-between">
        <span className="eyebrow text-[#084C2A]">{label}</span>
        <span className="meta text-[#667085]">{teams.length} ekip</span>
      </div>
      {teams.length === 0 ? (
        <div className="p-6 text-center body-sm text-[#667085]">
          Pa gen ekip nan gwoup sa a poko.
        </div>
      ) : (
        <div className="divide-y divide-[#E4E7EC]">
          {teams.map((t, i) => (
            <div key={t.id} className="px-5 py-3 flex items-center gap-3">
              <span className="tnum text-[#667085] font-bold w-6">{i + 1}.</span>
              {t.logoUrl ? (
                <img src={t.logoUrl} alt={t.name} className="w-6 h-6 object-contain" />
              ) : (
                <TeamCrestLocal team={t} />
              )}
              <span className="body-sm font-bold text-[#101828] flex-1">{t.name}</span>
              <span className="meta text-[#667085]">{t.shortName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCrestLocal({ team }: { team: TeamData }) {
  // Inline minimal crest (since we removed the import to avoid circular deps)
  return (
    <div
      className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ background: team.primaryColor, color: team.secondaryColor }}
    >
      {team.shortName.slice(0, 3).toUpperCase()}
    </div>
  );
}
