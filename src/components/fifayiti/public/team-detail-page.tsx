"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { TeamCrest } from "../team-crest";
import { MapPin, Wifi, ShieldCheck, Users, Trophy, ArrowLeft } from "lucide-react";

interface PlayerRow {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: string;
  dateOfBirth?: string | null;
  idNumber?: string | null;
  photoUrl?: string | null;
  status: string;
}

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  founded?: string | null;
  homeVenue?: string | null;
  venueAddress?: string | null;
  venueRouter?: string | null;
  venueConnectivity?: string;
  status: string;
  registeredAt?: string | null;
  group: string;
  logoUrl?: string | null;
  photoUrl?: string | null;
  players: PlayerRow[];
}

const POSITION_LABEL: Record<string, string> = {
  GK: "Gardyen",
  DEF: "Defans",
  MID: "Milye",
  FWD: "Atakan",
};

export function TeamDetailPage() {
  const { activeTeamId, setView } = useAppStore();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!activeTeamId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/teams/${activeTeamId}`);
        if (res.ok) {
          const data = await res.json();
          setTeam(data.team);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [activeTeamId]);

  if (loading) {
    return (
      <div className="bg-white min-h-[60vh] flex items-center justify-center">
        <p className="body-md text-[#667085]">Ap charger ekip la...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="bg-white min-h-[60vh] flex flex-col items-center justify-center p-8">
        <Trophy size={32} className="text-[#E4E7EC]" />
        <p className="mt-3 font-bold text-[#084C2A]">Pa gen ekip chwezi</p>
        <p className="meta text-[#667085] mt-1">
          Chwazi yon ekip nan paj Ekip yo pou wè detay li.
        </p>
        <button
          onClick={() => setView("teams")}
          className="mt-4 btn-primary"
        >
          <ArrowLeft size={14} /> Retounen nan ekip yo
        </button>
      </div>
    );
  }

  const roster = team.players ?? [];
  const gk = roster.filter((p) => p.position === "GK");
  const def = roster.filter((p) => p.position === "DEF");
  const mid = roster.filter((p) => p.position === "MID");
  const fwd = roster.filter((p) => p.position === "FWD");

  const statusLabel = team.status === "AKTIF" ? "Aktif"
    : team.status === "VERIFYE" ? "Verifye"
    : team.status === "AN_VERIFIKASYON" ? "Ap verifye"
    : team.status === "SOUMET" ? "Soumèt"
    : "Kreye";

  return (
    <div className="bg-white min-h-[60vh]">
      {/* Team profile header */}
      <div
        className="relative overflow-hidden border-b border-fifayiti-line"
        style={{
          background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.primaryColor}cc 60%, #053319 100%)`,
        }}
      >
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10 lg:py-14">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={team.name} className="w-20 h-20 object-contain" />
            ) : (
              <TeamCrest
                teamId={team.id}
                shortName={team.shortName}
                primary={team.primaryColor}
                secondary={team.secondaryColor}
                size="lg"
              />
            )}
            <div className="flex-1">
              <span className="eyebrow text-white/70">
                Gwoup {team.group} · Soti {team.founded || "—"}
              </span>
              <h1 className="display-md text-white mt-1">{team.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="eyebrow px-2.5 py-1 rounded bg-[#F4C400] text-[#084C2A]">
                  {statusLabel}
                </span>
                {team.venueAddress && (
                  <span className="eyebrow px-2.5 py-1 rounded bg-white/15 text-white">
                    {team.venueAddress}
                  </span>
                )}
              </div>
            </div>
            <div className="md:text-right">
              <p className="eyebrow text-white/55">Jwè</p>
              <p className="score text-4xl text-white mt-1 tnum">{roster.length}</p>
              <p className="meta text-white/70 mt-1">sou roste a</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8">
        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard icon={Users} label="Jwè" value={roster.length} accent />
          <StatCard icon={ShieldCheck} label="Gardyen" value={gk.length} />
          <StatCard icon={Users} label="Defans" value={def.length} />
          <StatCard icon={Users} label="Atakan" value={fwd.length} />
        </div>

        {/* Optional team photo */}
        {team.photoUrl && (
          <div className="mb-8 rounded-xl overflow-hidden">
            <img src={team.photoUrl} alt={team.name} className="w-full" />
          </div>
        )}

        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8">
          {/* Roster */}
          <div>
            <h2 className="heading-lg text-[#101828] mb-4">Jwè yo</h2>
            {roster.length === 0 ? (
              <div className="fifayiti-card border-dashed p-8 text-center">
                <Users size={28} className="mx-auto text-[#E4E7EC]" />
                <p className="mt-2 body-sm font-bold text-[#101828]">Pa gen jwè nan roste a poko</p>
                <p className="meta text-[#667085] mt-1">
                  Administratè yo ap ajoute jwè yo.
                </p>
              </div>
            ) : (
              <div className="fifayiti-card overflow-hidden">
                <PositionGroup label="Gardyen" players={gk} />
                <PositionGroup label="Defans" players={def} />
                <PositionGroup label="Milye" players={mid} />
                <PositionGroup label="Atak" players={fwd} />
              </div>
            )}
          </div>

          {/* Side panel */}
          <aside className="space-y-6">
            <div>
              <h2 className="heading-md text-[#101828] mb-3">Enfòmasyon ekip</h2>
              <div className="fifayiti-card p-5 space-y-3">
                <InfoRow
                  icon={<MapPin size={14} className="text-[#116B3A]" />}
                  label="Stad / Teren"
                  value={team.homeVenue || "—"}
                />
                <InfoRow
                  icon={<MapPin size={14} className="text-[#116B3A]" />}
                  label="Adrès"
                  value={team.venueAddress || "—"}
                />
                <InfoRow
                  icon={<Trophy size={14} className="text-[#116B3A]" />}
                  label="Fondasyon"
                  value={team.founded || "—"}
                />
                <div className="flex items-center justify-between border-t border-[#E4E7EC] pt-3">
                  <span className="inline-flex items-center gap-2 meta text-[#667085]">
                    <Wifi size={14} className="text-[#116B3A]" />
                    Konektivite
                  </span>
                  <span
                    className="eyebrow px-2 py-1 rounded"
                    style={{
                      background: team.venueConnectivity === "BON" ? "#116B3A"
                        : team.venueConnectivity === "MOYEN" ? "#F4C400" : "#D92D20",
                      color: team.venueConnectivity === "MOYEN" ? "#084C2A" : "#FFFFFF",
                    }}
                  >
                    {team.venueConnectivity === "BON" ? "Bon"
                      : team.venueConnectivity === "MOYEN" ? "Mwayen" : "Fèb"}
                  </span>
                </div>
              </div>
            </div>

            <button onClick={() => setView("teams")} className="btn-secondary">
              ← Retounen nan ekip yo
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent = false }: { icon: React.ElementType; label: string; value: number; accent?: boolean }) {
  return (
    <div className="fifayiti-card p-5">
      <Icon size={18} className="text-[#667085]" />
      <p className={`mt-3 tnum ${accent ? "score text-3xl" : "score text-2xl"}`} style={{ color: accent ? "#116B3A" : "#101828" }}>
        {value}
      </p>
      <p className="meta text-[#667085] mt-1">{label}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="inline-flex items-center gap-2 meta text-[#667085]">{icon}{label}</span>
      <span className="body-sm font-bold text-[#101828] text-right">{value}</span>
    </div>
  );
}

function PositionGroup({ label, players }: { label: string; players: PlayerRow[] }) {
  if (players.length === 0) return null;
  return (
    <div className="border-b border-[#D0D5DD] last:border-b-0">
      <div className="px-4 py-2 bg-[#F4F7F3] flex items-center justify-between">
        <span className="eyebrow text-[#667085]">{label}</span>
        <span className="eyebrow text-[#667085] tnum">{players.length}</span>
      </div>
      {players.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-[#D0D5DD]">
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.firstName} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold tnum"
              style={{ background: "#F4F7F3", color: "#084C2A" }}
            >
              {p.jerseyNumber}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="body-sm font-semibold text-[#101828] truncate">
              {p.firstName} {p.lastName}
            </p>
            <p className="meta text-[#667085]">{p.idNumber || "—"}</p>
          </div>
          <span className="eyebrow text-[#667085] bg-[#F4F7F3] px-1.5 py-0.5 rounded">
            {POSITION_LABEL[p.position] ?? p.position}
          </span>
        </div>
      ))}
    </div>
  );
}
