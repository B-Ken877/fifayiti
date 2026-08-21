"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Search, Users } from "lucide-react";

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
  teamId: string;
}

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
  players?: PlayerRow[];
}

const POSITION_LABEL: Record<string, string> = {
  GK: "Gardyen",
  DEF: "Defans",
  MID: "Milye",
  FWD: "Atakan",
};

export function PlayersPage() {
  const { setActiveTeamId, setView } = useAppStore();
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/teams");
        const data = await res.json();
        setTeams(data.teams ?? []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  // Flatten all players across teams, attaching the team object
  const allPlayers: { player: PlayerRow; team: TeamData }[] = [];
  for (const t of teams) {
    for (const p of t.players ?? []) {
      allPlayers.push({ player: p, team: t });
    }
  }

  const filtered = allPlayers.filter(({ player, team }) => {
    const name = `${player.firstName} ${player.lastName}`.toLowerCase();
    return (
      (teamFilter === "all" || team.id === teamFilter) &&
      (name.includes(q.toLowerCase()) ||
        (player.idNumber ?? "").toLowerCase().includes(q.toLowerCase()))
    );
  });

  return (
    <div className="bg-white min-h-[60vh]">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10 lg:py-14">
        <span className="eyebrow text-[#116B3A]">FIFAYITI 2026</span>
        <h1 className="display-md text-[#101828] mt-2">Jwè</h1>
        <p className="body-sm text-[#667085] mt-3 max-w-2xl">
          {allPlayers.length > 0
            ? `${allPlayers.length} jwè enskri nan FIFAYITI 2026.`
            : "Pa gen jwè enskri pou kounye a. Administratè yo ap ajoute yo."}
        </p>

        {allPlayers.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Non jwè oswa nimewo idantite..."
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-white border border-[#D0D5DD] body-md text-[#101828] placeholder:text-[#667085] focus:outline-none focus:border-[#116B3A]"
                style={{ minHeight: 44 }}
                aria-label="Chèche jwè"
              />
            </div>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-3 py-3 rounded-lg bg-white border border-[#D0D5DD] body-md text-[#101828] font-semibold focus:outline-none focus:border-[#116B3A]"
              style={{ minHeight: 44 }}
              aria-label="Filtre pa ekip"
            >
              <option value="all">Tout ekip yo</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center body-md text-[#667085]">Ap charger jwè yo...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Users size={32} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-3 body-md text-[#667085]">
              {allPlayers.length === 0
                ? "Pa gen jwè enskri poko."
                : "Pa gen jwè ki koresponn ak kritè ou a."}
            </p>
          </div>
        ) : (
          <div className="mt-8 fifayiti-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="eyebrow text-[#667085] bg-[#F4F7F3]">
                  <th className="px-4 py-3 text-left">Jwè</th>
                  <th className="px-4 py-3 text-left">Ekip</th>
                  <th className="px-3 py-3 text-center">Pozisyon</th>
                  <th className="px-3 py-3 text-center">N°</th>
                  <th className="px-4 py-3 text-left">Estati</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ player: p, team }) => (
                  <tr key={p.id} className="border-t border-[#D0D5DD] hover:bg-[#F4F7F3] transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setActiveTeamId(team.id);
                          setView("team-detail");
                        }}
                        className="flex items-center gap-2"
                      >
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt={p.firstName} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <span
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
                            style={{ background: team.primaryColor, color: team.secondaryColor }}
                            aria-label={`${p.firstName} ${p.lastName}`}
                          >
                            {p.firstName[0]}{p.lastName[0]}
                          </span>
                        )}
                        <span className="body-sm font-semibold text-[#101828]">
                          {p.firstName} {p.lastName}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="body-sm text-[#667085]">{team.name}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="eyebrow text-[#116B3A] bg-[#116B3A]/8 px-2 py-0.5 rounded">
                        {POSITION_LABEL[p.position] ?? p.position}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-[#101828] tnum">
                      {p.jerseyNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="eyebrow"
                        style={{
                          color: p.status === "VERIFYE" ? "#116B3A"
                            : p.status === "AN_ATANT" ? "#F4C400"
                            : "#D92D20",
                        }}
                      >
                        {p.status === "VERIFYE" ? "Verifye"
                          : p.status === "AN_ATANT" ? "Ap tann"
                          : p.status === "REFIZE" ? "Refize"
                          : "Koreksyon"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
