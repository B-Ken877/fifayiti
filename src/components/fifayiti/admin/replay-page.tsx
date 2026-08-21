"use client";
import { useMemo, useState } from "react";
import {
  allReplays,
  teamById,
  playerById,
  matchById,
  formatKickoff,
  type Replay,
} from "@/lib/fifayiti-data";
import { ReplayCard } from "../public/replay-card";
import { TeamCrest } from "../team-crest";
import {
  ShieldCheck,
  Lock,
  Filter,
  Play,
  Link2,
  Clock,
  Calendar,
  User,
  Trophy,
  Film,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type KindFilter = "TOUT" | Replay["kind"];

const KINDS: KindFilter[] = ["TOUT", "GOL", "SAV", "KADON", "KAT", "SUBSTITUSYON"];

const KIND_LABEL: Record<Replay["kind"], string> = {
  GOL: "Gòl",
  SAV: "Sov",
  KADON: "Kat wouj",
  KAT: "Kat",
  SUBSTITUSYON: "Ranplasman",
};

export function ReplayArchivePage() {
  const [kindFilter, setKindFilter] = useState<KindFilter>("TOUT");
  const [matchFilter, setMatchFilter] = useState<string>("TOUT");
  const [teamFilter, setTeamFilter] = useState<string>("TOUT");
  const [selected, setSelected] = useState<Replay | null>(null);

  const replays = allReplays();

  const matches = useMemo(() => {
    const map = new Map<string, string>();
    replays.forEach((r) => {
      const m = matchById(r.matchId);
      if (m) {
        const home = teamById(m.homeTeamId)?.shortName ?? "";
        const away = teamById(m.awayTeamId)?.shortName ?? "";
        map.set(m.id, `${home} vs ${away}`);
      }
    });
    return Array.from(map.entries());
  }, [replays]);

  const teams = useMemo(() => {
    const ids = new Set<string>();
    replays.forEach((r) => r.teamId && ids.add(r.teamId));
    return Array.from(ids).map((id) => ({
      id,
      name: teamById(id)?.name ?? "",
      shortName: teamById(id)?.shortName ?? "",
    }));
  }, [replays]);

  const filtered = useMemo(() => {
    return replays.filter((r) => {
      const okKind = kindFilter === "TOUT" || r.kind === kindFilter;
      const okMatch = matchFilter === "TOUT" || r.matchId === matchFilter;
      const okTeam = teamFilter === "TOUT" || r.teamId === teamFilter;
      return okKind && okMatch && okTeam;
    });
  }, [replays, kindFilter, matchFilter, teamFilter]);

  const selectedMatch = selected ? matchById(selected.matchId) : undefined;
  const selectedTeam = selected?.teamId ? teamById(selected.teamId) : undefined;
  const selectedPlayer = selected?.playerId ? playerById(selected.playerId) : undefined;

  return (
    <div className="space-y-6">
      {/* Locked banner */}
      <section className="fifayiti-card p-4 md:p-5" style={{ borderColor: "#116B3A", background: "rgba(17,107,58,0.08)" }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#116B3A] flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-[#F4C400]" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085] mb-1">Archive pèmanè</p>
            <h2 className="heading-lg text-[#084C2A] flex items-center gap-2">
              <Lock size={16} className="text-[#116B3A]" />
              Replay Archive Pèmanè
            </h2>
            <p className="body-sm text-[#667085] mt-1">
              🔒 tout replay ofisyèl se pèmanè. Pa gen bouton pou efase.
              Chak replay konekte ak match, ekip, jwè, evenman, minit, ak
              timestamps.
            </p>
          </div>
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md eyebrow bg-[#116B3A] text-white">
            <ShieldCheck size={12} /> Pèmanè
          </span>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Replay total" value={replays.length} tone="#084C2A" />
        <KPI
          label="Match konekte"
          value={new Set(replays.map((r) => r.matchId)).size}
          tone="#116B3A"
        />
        <KPI
          label="Ekip konekte"
          value={new Set(replays.map((r) => r.teamId)).size}
          tone="#116B3A"
        />
        <KPI label="Gòl sove" value={replays.filter((r) => r.kind === "GOL").length} tone="#F4C400" fg="#084C2A" />
      </section>

      {/* Filters */}
      <section className="fifayiti-card p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-2 eyebrow text-[#667085]">
          <Filter size={14} /> Filtre
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {/* Match filter */}
          <div>
            <label className="block eyebrow text-[#667085] mb-1.5">
              Pa match
            </label>
            <select
              value={matchFilter}
              onChange={(e) => setMatchFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#101828]"
              style={{ minHeight: 44 }}
            >
              <option value="TOUT">Tout match</option>
              {matches.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {/* Team filter */}
          <div>
            <label className="block eyebrow text-[#667085] mb-1.5">
              Pa ekip
            </label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#101828]"
              style={{ minHeight: 44 }}
            >
              <option value="TOUT">Tout ekip</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {/* Kind filter */}
          <div>
            <label className="block eyebrow text-[#667085] mb-1.5">
              Pa tip evenman
            </label>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-[10px] eyebrow transition-all",
                    kindFilter === k
                      ? "bg-[#084C2A] text-white"
                      : "bg-[#F4F7F3] text-[#667085] hover:bg-[#E4E7EC]"
                  )}
                  style={{ minHeight: 32 }}
                >
                  {k === "TOUT" ? "Tout" : KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Replay grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="heading-lg text-[#084C2A]">
            Archive (<span className="tnum">{filtered.length}</span>)
          </h3>
        </div>
        {filtered.length === 0 ? (
          <div className="fifayiti-card border-dashed p-10 text-center">
            <Film size={28} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-2 body-sm font-bold text-[#101828]">Pa gen replay</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r) => {
              const team = r.teamId ? teamById(r.teamId) : undefined;
              const player = r.playerId ? playerById(r.playerId) : undefined;
              const match = matchById(r.matchId);
              return (
                <div key={r.id} className="space-y-1.5">
                  <ReplayCard replay={r} onClick={() => setSelected(r)} />
                  <div className="px-1">
                    <p className="meta text-[#667085] inline-flex items-center gap-1 flex-wrap">
                      <Link2 size={9} />
                      Linked to:
                    </p>
                    <p className="meta text-[#667085] leading-relaxed">
                      Match{" "}
                      <strong className="text-[#084C2A]">
                        {match ? `${teamById(match.homeTeamId)?.shortName} vs ${teamById(match.awayTeamId)?.shortName}` : r.matchId}
                      </strong>{" "}
                      ·{" "}
                      <strong className="text-[#084C2A]">{match?.competition}</strong>{" "}
                      · Team{" "}
                      <strong className="text-[#084C2A]">{team?.name}</strong>{" "}
                      · Player{" "}
                      <strong className="text-[#084C2A]">
                        {player ? `${player.firstName} ${player.lastName}` : "—"}
                      </strong>{" "}
                      · Event{" "}
                      <strong className="text-[#084C2A]">{KIND_LABEL[r.kind]}</strong>{" "}
                      · Minute{" "}
                      <strong className="text-[#084C2A] tnum">{r.minute}'</strong>{" "}
                      · Timestamp{" "}
                      <strong className="text-[#084C2A]">
                        {new Date(r.savedAt).toLocaleString("fr-FR")}
                      </strong>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Detail modal */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#084C2A] flex items-center gap-2">
              <Play size={16} className="text-[#116B3A]" fill="#116B3A" />
              {selected?.title}
            </DialogTitle>
            <DialogDescription>
              Enfòmasyon lye — tout replay ofisyèl se pèmanè.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-3">
              {/* Thumbnail */}
              <div className="aspect-video rounded-xl bg-pitch-texture relative overflow-hidden flex items-center justify-center">
                {selectedTeam && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-30">
                    <TeamCrest
                      teamId={selectedTeam.id}
                      shortName={selectedTeam.shortName}
                      primary={selectedTeam.primaryColor}
                      secondary={selectedTeam.secondaryColor}
                      size="lg"
                    />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                    <Play size={20} className="text-[#116B3A] ml-0.5" fill="#116B3A" />
                  </div>
                </div>
                <div className="absolute top-2 left-2 inline-flex items-center px-2 py-1 rounded-md eyebrow bg-[#F4C400] text-[#084C2A]">
                  <span className="tnum">{selected.minute}'</span>
                </div>
                <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md eyebrow uppercase bg-black/60 text-white">
                  <Lock size={10} />
                  {KIND_LABEL[selected.kind]}
                </div>
              </div>

              {/* Metadata structured */}
              <div className="rounded-xl border border-[#E4E7EC] divide-y divide-[#E4E7EC]">
                <MetaRow
                  icon={<Trophy size={12} className="text-[#116B3A]" />}
                  label="Konpetisyon"
                  value={selectedMatch?.competition ?? "—"}
                />
                <MetaRow
                  icon={<Film size={12} className="text-[#116B3A]" />}
                  label="Match"
                  value={
                    selectedMatch
                      ? `${teamById(selectedMatch.homeTeamId)?.shortName} vs ${teamById(selectedMatch.awayTeamId)?.shortName}`
                      : selected.matchId
                  }
                  sub={selectedMatch ? formatKickoff(selectedMatch.kickoff) : undefined}
                />
                {selectedTeam && (
                  <MetaRow
                    icon={<TeamCrestMini team={selectedTeam} />}
                    label="Ekip"
                    value={selectedTeam.name}
                  />
                )}
                {selectedPlayer && (
                  <MetaRow
                    icon={<User size={12} className="text-[#116B3A]" />}
                    label="Jwè"
                    value={`${selectedPlayer.firstName} ${selectedPlayer.lastName}`}
                    sub={`#${selectedPlayer.jerseyNumber} · ${selectedPlayer.idNumber}`}
                  />
                )}
                <MetaRow
                  icon={<Play size={12} className="text-[#116B3A]" />}
                  label="Evenman"
                  value={KIND_LABEL[selected.kind]}
                />
                <MetaRow
                  icon={<Clock size={12} className="text-[#116B3A]" />}
                  label="Minit"
                  value={`${selected.minute}'`}
                />
                <MetaRow
                  icon={<Calendar size={12} className="text-[#116B3A]" />}
                  label="Timestamp"
                  value={new Date(selected.savedAt).toLocaleString("fr-FR")}
                />
              </div>

              <div className="rounded-lg bg-[#116B3A]/8 border border-[#116B3A]/30 p-3 flex items-center gap-2">
                <ShieldCheck size={14} className="text-[#116B3A] shrink-0" />
                <p className="meta text-[#667085]">
                  <strong className="text-[#084C2A]">Pèmanè:</strong> Replay sa a
                  pa kapab efase — li se yon dokiman ofisyèl FIFAYITI.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
  fg = "#FFFFFF",
}: {
  label: string;
  value: number;
  tone: string;
  fg?: string;
}) {
  return (
    <div
      className="fifayiti-card p-4"
      style={{ background: tone, borderColor: tone, color: fg }}
    >
      <p className="heading-lg tnum">{value}</p>
      <p className="mt-1 eyebrow opacity-80">
        {label}
      </p>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="eyebrow text-[#667085]">
          {label}
        </p>
        <p className="body-sm font-bold text-[#101828] truncate">{value}</p>
        {sub && <p className="meta text-[#667085]">{sub}</p>}
      </div>
    </div>
  );
}

function TeamCrestMini({ team }: { team: ReturnType<typeof teamById> }) {
  if (!team) return null;
  return (
    <TeamCrest
      teamId={team.id}
      shortName={team.shortName}
      primary={team.primaryColor}
      secondary={team.secondaryColor}
      size="xs"
    />
  );
}
