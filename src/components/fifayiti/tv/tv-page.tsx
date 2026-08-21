"use client";
import { useEffect, useState } from "react";
import { Play, Pause, Volume2, Maximize, Radio, MessageCircle, BarChart3 } from "lucide-react";
import { LiveBadge } from "../live-badge";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
}

interface MatchEvent {
  id: string;
  minute: number;
  half: number;
  kind: string;
  description: string;
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
  clock?: number;
  half?: string;
  events: MatchEvent[];
}

export function TvPage() {
  const { setView, setActiveMatchId } = useAppStore();
  const [live, setLive] = useState<MatchData | null>(null);
  const [home, setHome] = useState<TeamData | null>(null);
  const [away, setAway] = useState<TeamData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<"live" | "replays">("live");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/matches");
        const data = await res.json();
        const liveMatch = (data.matches as MatchData[])?.find((m) => m.status === "AN_DIRÈK");
        if (liveMatch) {
          setLive(liveMatch);
          const [hRes, aRes] = await Promise.all([
            fetch(`/api/teams/${liveMatch.homeTeamId}`).then((r) => r.json()),
            fetch(`/api/teams/${liveMatch.awayTeamId}`).then((r) => r.json()),
          ]);
          setHome(hRes.team ?? null);
          setAway(aRes.team ?? null);
        }
      } catch {}
    })();
  }, []);

  return (
    <div className="bg-pitch-texture-dark text-white min-h-[80vh]">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 lg:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="eyebrow text-[#F4C400]">Broadcast</span>
              {live && <LiveBadge variant="yellow" />}
            </div>
            <h1 className="display-lg text-white">FIFAYITI TV</h1>
          </div>
          <div className="hidden md:flex items-center gap-2 meta text-white/60">
            <Radio size={14} className="text-[#F4C400]" />
            <span>Ekip pwodiksyon FIFAYITI</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.7fr_1fr] gap-6">
          {/* Player + tabs */}
          <div>
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-fifayiti-line">
              {live && home && away ? (
                <>
                  <div className="absolute inset-0 bg-pitch-texture-dark" />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      onClick={() => setPlaying(!playing)}
                      className="w-16 h-16 rounded-full bg-[#F4C400] flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"
                      aria-label={playing ? "Poz" : "Jwe"}
                    >
                      {playing ? <Pause size={26} className="text-[#084C2A]" fill="#084C2A" /> : <Play size={26} className="text-[#084C2A] ml-1" fill="#084C2A" />}
                    </button>
                  </div>

                  <div className="absolute top-0 inset-x-0 p-4">
                    <div className="flex items-center justify-between bg-black/70 backdrop-blur-md rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <LiveBadge size="sm" variant="yellow" />
                        <span className="body-sm font-bold text-white">
                          {home.shortName} vs {away.shortName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="score text-2xl text-[#F4C400]">
                          {live.homeScore} — {live.awayScore}
                        </span>
                        <span className="meta font-bold text-white/80 tnum">{live.clock ?? 0}'</span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute bottom-0 inset-x-0 p-4">
                    <div className="flex items-center justify-between bg-black/70 backdrop-blur-md rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setPlaying(!playing)} className="text-white hover:text-[#F4C400]" aria-label={playing ? "Poz" : "Jwe"}>
                          {playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                        </button>
                        <Volume2 size={16} className="text-white/70" />
                      </div>
                      <div className="flex items-center gap-3">
                        <Maximize size={14} className="text-white/70" />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 bg-pitch-texture-dark flex flex-col items-center justify-center text-white/70 p-8 text-center">
                  <Radio size={32} className="text-[#F4C400] mb-3" />
                  <p className="heading-md font-bold text-white">Pa gen match an dirèk kounye a</p>
                  <p className="body-sm text-white/60 mt-1">
                    Tcheke pita pou match kap vini yo.
                  </p>
                  <button onClick={() => setTab("replays")} className="mt-5 btn-featured">
                    Gade pi bon aksyon yo
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="mt-4 flex items-center gap-1 border-b border-fifayiti-line">
              <TabButton active={tab === "live"} onClick={() => setTab("live")} icon={Radio} label="An dirèk" />
              <TabButton active={tab === "replays"} onClick={() => setTab("replays")} icon={Play} label="Replay" />
              <TabButton
                active={false}
                onClick={() => {
                  if (live) {
                    setActiveMatchId(live.id);
                    setView("match");
                  }
                }}
                icon={BarChart3}
                label="Estatistik"
              />
            </div>

            {/* Match info */}
            {tab === "live" && live && home && away && (
              <div className="mt-5 fifayiti-card-dark p-5">
                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  <div>
                    <p className="meta text-white/60">{home.shortName}</p>
                    <p className="score text-3xl text-white mt-1">{live.homeScore}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-white/40">Minit</p>
                    <p className="score text-2xl text-[#F4C400] mt-1">{live.clock ?? 0}'</p>
                  </div>
                  <div>
                    <p className="meta text-white/60">{away.shortName}</p>
                    <p className="score text-3xl text-white mt-1">{live.awayScore}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-fifayiti-line grid grid-cols-2 gap-3 body-sm">
                  <div>
                    <p className="meta text-white/50 mb-1">Teren</p>
                    <p className="font-semibold text-white">{live.venue || "—"}</p>
                  </div>
                  <div>
                    <p className="meta text-white/50 mb-1">Abit</p>
                    <p className="font-semibold text-white truncate">{live.referee || "—"}</p>
                  </div>
                </div>
              </div>
            )}

            {tab === "replays" && (
              <div className="mt-5 fifayiti-card-dark p-6 text-center body-sm text-white/60">
                Pa gen replay disponib poko.
              </div>
            )}
          </div>

          {/* Right — commentary */}
          <aside className="space-y-4">
            <div className="fifayiti-card-dark overflow-hidden">
              <div className="px-4 py-3 border-b border-fifayiti-line flex items-center gap-2">
                <MessageCircle size={16} className="text-[#F4C400]" />
                <span className="body-sm font-bold">Kòmantè an dirèk</span>
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto space-y-3">
                {live && (live.events ?? []).length > 0 ? (
                  live.events.slice().sort((a, b) => (b.half - a.half) || (b.minute - a.minute)).map((ev) => (
                    <div key={ev.id} className="body-sm">
                      <span className="font-bold text-[#F4C400] tnum">{ev.minute}'</span>
                      <span className="ml-2 text-white/80">{ev.description}</span>
                    </div>
                  ))
                ) : (
                  <p className="body-sm text-white/60">
                    Kòmantè ap parèt la a pandan match la.
                  </p>
                )}
              </div>
            </div>

            <div className="fifayiti-card-dark p-4">
              <p className="eyebrow text-[#F4C400] mb-3">Ekip pwodiksyon</p>
              <ul className="space-y-2 body-sm text-white/80">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#F4C400]" /> 2 Manm kamera
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#F4C400]" /> 1 Operatè/Direktè
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#F4C400]" /> 1 Operatè live
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#F4C400]" /> 2 Kòmantatè
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-3 body-sm font-semibold -mb-px border-b-2 transition-colors",
        active ? "border-[#F4C400] text-[#F4C400]" : "border-transparent text-white/55 hover:text-white"
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
