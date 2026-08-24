"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useAuthSessionStore } from "@/store/auth-session-store";
import { RoleGreetingBanner } from "./role-shell";
import { TeamCrest } from "../team-crest";
import { LiveBadge } from "../live-badge";
import {
  Users,
  UserCheck,
  CalendarClock,
  Radio,
  Film,
  ChevronRight,
  ShieldCheck,
  WifiOff,
  Cloud,
  Server,
  History,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

type KPITone = "green" | "yellow" | "red";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
  status: string;
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
  clock?: number;
  half?: string;
  events?: any[];
}

export function AdminDashboard() {
  const { setView, setActiveMatchId, online, pendingSync } = useAppStore();
  const { adminRole } = useAuthSessionStore();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, mRes] = await Promise.all([
          fetch("/api/teams").then((r) => r.json()),
          fetch("/api/matches").then((r) => r.json()),
        ]);
        setTeams(tRes.teams ?? []);
        setMatches(mRes.matches ?? []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const teamById = (id: string) => teams.find((t) => t.id === id);

  const totalPlayers = teams.reduce((acc, t) => acc + (t.players?.length ?? 0), 0);
  const activeTeams = teams.filter((t) => t.status === "AKTIF").length;
  const pendingPlayers = teams.reduce(
    (acc, t) => acc + (t.players?.filter((p: any) => p.status === "AN_ATANT").length ?? 0),
    0
  );
  const upcoming = matches.filter((m) => m.status === "PWOGRAM").length;
  const live = matches.find((m) => m.status === "AN_DIRÈK") ?? null;
  const recentMatches = matches
    .filter((m) => m.status === "FINI" || m.status === "AN_DIRÈK")
    .slice(0, 5);
  const pendingApproval = matches.filter((m) => m.status === "AN_ATANT_APWOVASYON");

  const kpis: {
    label: string;
    value: number;
    total?: number;
    icon: React.ElementType;
    tone: KPITone;
    onClick: () => void;
  }[] = [
    {
      label: "Ekip aktif",
      value: activeTeams,
      total: teams.length,
      icon: Users,
      tone: "green",
      onClick: () => setView("admin-teams"),
    },
    {
      label: "Jwè an verifikasyon",
      value: pendingPlayers,
      icon: UserCheck,
      tone: pendingPlayers > 0 ? "yellow" : "green",
      onClick: () => setView("admin-players"),
    },
    {
      label: "Match kap vini",
      value: upcoming,
      icon: CalendarClock,
      tone: "green",
      onClick: () => setView("admin-match-control"),
    },
    {
      label: "Match an dirèk",
      value: live ? 1 : 0,
      icon: Radio,
      tone: live ? "red" : "green",
      onClick: () => {
        if (live) {
          setActiveMatchId(live.id);
          setView("admin-match-control");
        }
      },
    },
    {
      label: "Jwè total",
      value: totalPlayers,
      icon: Users,
      tone: "green",
      onClick: () => setView("admin-teams"),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="fifayiti-card p-10 text-center">
          <p className="body-md text-[#667085]">Ap charger dashboard la...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role-specific greeting banner */}
      <RoleGreetingBanner role={adminRole} />

      {/* KPI grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          const tone = k.tone;
          const colors = tone === "green"
            ? { bg: "#116B3A", fg: "#FFFFFF", iconBg: "rgba(255,255,255,0.18)" }
            : tone === "yellow"
            ? { bg: "#F4C400", fg: "#084C2A", iconBg: "rgba(8,76,42,0.12)" }
            : { bg: "#D92D20", fg: "#FFFFFF", iconBg: "rgba(255,255,255,0.18)" };
          return (
            <button
              key={k.label}
              onClick={k.onClick}
              className="fifayiti-card p-4 md:p-5 text-left hover:border-[#116B3A] hover:shadow-md transition-all"
              style={{ background: colors.bg }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                style={{ background: colors.iconBg }}
              >
                <Icon size={18} style={{ color: colors.fg }} />
              </div>
              <p className="score text-3xl tnum" style={{ color: colors.fg }}>
                {k.value}
                {k.total !== undefined && (
                  <span className="text-base font-normal opacity-60">/{k.total}</span>
                )}
              </p>
              <p className="meta mt-1" style={{ color: colors.fg, opacity: 0.85 }}>
                {k.label}
              </p>
            </button>
          );
        })}
      </section>

      {/* If DB is empty — call to action */}
      {teams.length === 0 && matches.length === 0 && (
        <section className="fifayiti-card border-dashed p-8 text-center" style={{ borderColor: "#F4C400", background: "rgba(244,196,0,0.05)" }}>
          <Trophy size={32} className="mx-auto text-[#F4C400]" />
          <p className="mt-3 heading-md text-[#084C2A]">Byenveni nan administrasyon FIFAYITI</p>
          <p className="body-sm text-[#667085] mt-1 max-w-md mx-auto">
            Pa gen done poko. Kòmanse pa kreye premye ekip ou a, epi ajoute jwè yo.
          </p>
          <button onClick={() => setView("admin-teams")} className="mt-4 btn-featured">
            <Users size={14} /> Kreye premye ekip la
          </button>
        </section>
      )}

      {/* Live + Sync */}
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        {/* Live match or next-up */}
        <section className="fifayiti-card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="eyebrow text-[#667085]">Aktivite</p>
              <h3 className="heading-md text-[#084C2A]">Match resan</h3>
            </div>
            <button
              onClick={() => setView("admin-match-control")}
              className="meta font-bold text-[#116B3A] hover:underline inline-flex items-center gap-1"
            >
              Kontwòl match <ChevronRight size={14} />
            </button>
          </div>

          {live ? (
            <LiveMatchInline
              match={live}
              home={teamById(live.homeTeamId)}
              away={teamById(live.awayTeamId)}
              onOpen={() => {
                setActiveMatchId(live.id);
                setView("admin-match-control");
              }}
            />
          ) : recentMatches.length > 0 ? (
            <div className="space-y-2">
              {recentMatches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setActiveMatchId(m.id);
                    setView("admin-match-control");
                  }}
                  className="w-full text-left rounded-lg border border-[#E4E7EC] bg-white p-3 hover:border-[#116B3A] transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      const h = teamById(m.homeTeamId);
                      const a = teamById(m.awayTeamId);
                      return h && a ? `${h.shortName} vs ${a.shortName}` : "Match";
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="eyebrow text-[#116B3A] bg-[#116B3A]/8 px-2 py-0.5 rounded">
                      {m.status === "FINI" ? "Fini" : m.status === "AN_DIRÈK" ? "An dirèk" : m.status}
                    </span>
                    <span className="score text-lg text-[#101828] tnum">
                      {m.homeScore} - {m.awayScore}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center body-sm text-[#667085]">
              Pa gen match ki pase oswa ki ap pase poko.
            </div>
          )}
        </section>

        {/* Sync status */}
        <section className="fifayiti-card p-4 md:p-5 space-y-4">
          <div>
            <p className="eyebrow text-[#667085]">Sistèm</p>
            <h3 className="heading-md text-[#084C2A]">Estati senkronizasyon</h3>
          </div>
          <div className="space-y-2">
            <SyncRow
              icon={online ? Cloud : WifiOff}
              label={online ? "Sèv konekte" : "Mode offline"}
              tone={online ? "green" : "red"}
            />
            <SyncRow
              icon={Server}
              label={`${pendingSync} evenman an atant`}
              tone={pendingSync > 0 ? "yellow" : "green"}
            />
            <SyncRow
              icon={ShieldCheck}
              label="Tout aksyon anrejistre"
              tone="green"
            />
          </div>
          <p className="meta text-[#667085] pt-2 border-t border-[#E4E7EC]">
            Tout chanjman administratè yo ap parèt sou sit piblik la an tan reyèl.
          </p>
        </section>
      </div>
    </div>
  );
}

function LiveMatchInline({
  match, home, away, onOpen,
}: {
  match: MatchData;
  home?: TeamData;
  away?: TeamData;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl bg-pitch-texture-dark text-white p-4 hover:shadow-lg transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <LiveBadge variant="yellow" />
        <span className="meta font-bold text-white/80 tnum">{Math.floor((match.clock ?? 0) / 60)}'</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {home?.logoUrl ? (
            <img src={home.logoUrl} alt={home.name} className="w-6 h-6 object-contain" />
          ) : home ? (
            <TeamCrest teamId={home.id} shortName={home.shortName} primary={home.primaryColor} secondary={home.secondaryColor} size="xs" />
          ) : null}
          <span className="body-sm font-bold truncate">{home?.name ?? "—"}</span>
        </div>
        <span className="score text-3xl text-white">
          {match.homeScore} - {match.awayScore}
        </span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="body-sm font-bold truncate">{away?.name ?? "—"}</span>
          {away?.logoUrl ? (
            <img src={away.logoUrl} alt={away.name} className="w-6 h-6 object-contain" />
          ) : away ? (
            <TeamCrest teamId={away.id} shortName={away.shortName} primary={away.primaryColor} secondary={away.secondaryColor} size="xs" />
          ) : null}
        </div>
      </div>
    </button>
  );
}

function SyncRow({
  icon: Icon, label, tone,
}: {
  icon: React.ElementType;
  label: string;
  tone: "green" | "yellow" | "red";
}) {
  const color = tone === "green" ? "#116B3A"
    : tone === "yellow" ? "#F4C400" : "#D92D20";
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#E4E7EC] bg-[#F4F7F3] px-3 py-2">
      <span className="inline-flex items-center gap-2 body-sm text-[#101828]">
        <Icon size={14} style={{ color }} />
        {label}
      </span>
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}
