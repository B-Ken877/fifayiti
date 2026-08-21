"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Search, Trophy } from "lucide-react";
import { TeamCrest } from "../team-crest";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  founded?: string | null;
  homeVenue?: string | null;
  status: string;
  registeredAt?: string | null;
  group: string;
  logoUrl?: string | null;
  players?: any[];
}

export function TeamsPage() {
  const { setView, setActiveTeamId } = useAppStore();
  const [q, setQ] = useState("");
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

  const filtered = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(q.toLowerCase()) ||
      t.shortName.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="bg-white min-h-[60vh]">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10 lg:py-14">
        <span className="eyebrow text-[#116B3A]">FIFAYITI 2026</span>
        <h1 className="display-md text-[#101828] mt-2">Ekip yo</h1>
        <p className="body-sm text-[#667085] mt-3 max-w-2xl">
          {teams.length > 0
            ? `${teams.length} ekip enskri nan FIFAYITI 2026.`
            : "Pa gen ekip enskri pou kounye a. Prezidan ap ajoute yo."}
        </p>

        <div className="mt-6 relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chèche ekip..."
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-white border border-[#D0D5DD] body-md text-[#101828] placeholder:text-[#667085] focus:outline-none focus:border-[#116B3A]"
            style={{ minHeight: 44 }}
            aria-label="Chèche ekip"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center body-md text-[#667085]">Ap charger ekip yo...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Trophy size={32} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-3 body-md text-[#667085]">
              {teams.length === 0
                ? "Pa gen ekip enskri poko."
                : "Pa gen ekip ki koresponn ak rechèch ou a."}
            </p>
          </div>
        ) : (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <TeamClubCard
                key={t.id}
                team={t}
                onClick={() => {
                  setActiveTeamId(t.id);
                  setView("team-detail");
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamClubCard({ team, onClick }: { team: TeamData; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fifayiti-card overflow-hidden hover:border-[#116B3A] hover:shadow-md transition-all text-left"
    >
      <div
        className="h-2"
        style={{ background: `linear-gradient(90deg, ${team.primaryColor} 0%, ${team.secondaryColor} 100%)` }}
        aria-hidden
      />
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          {team.logoUrl ? (
            <img src={team.logoUrl} alt={team.name} className="w-12 h-12 object-contain" />
          ) : (
            <TeamCrest
              teamId={team.id}
              shortName={team.shortName}
              primary={team.primaryColor}
              secondary={team.secondaryColor}
              size="md"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="heading-md text-[#101828] truncate">{team.name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="eyebrow text-[#667085] bg-[#F4F7F3] px-1.5 py-0.5 rounded">
                Gwoup {team.group}
              </span>
              <span className="eyebrow text-[#116B3A] bg-[#116B3A]/8 px-1.5 py-0.5 rounded">
                {team.players?.length ?? 0} jwè
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="meta text-[#667085] truncate">{team.homeVenue || "—"}</span>
          <span className="meta font-bold text-[#116B3A]">Gade ekip la →</span>
        </div>
      </div>
    </button>
  );
}
