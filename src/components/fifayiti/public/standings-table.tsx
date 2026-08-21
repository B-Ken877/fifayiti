"use client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { TeamCrest } from "../team-crest";
import { type TeamRecord } from "@/lib/fifayiti-data";

interface TeamLike {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
}

interface StandingsTableProps {
  variant?: "compact" | "full";
  className?: string;
  teams?: TeamRecord[];
  /** Optional: teams data to look up names/crests. If omitted, table shows
   *  only the records (no team name). */
  teamData?: TeamLike[];
  limit?: number;
  /** How many positions are qualification zones (top N advance). */
  qualificationZones?: number;
}

export function StandingsTable({
  variant = "full",
  className,
  teams,
  teamData,
  limit,
  qualificationZones = 2,
}: StandingsTableProps) {
  const { setView, setActiveTeamId } = useAppStore();

  const rows = teams ?? [];
  const shown = limit ? rows.slice(0, limit) : rows;

  const openTeam = (id: string) => {
    setActiveTeamId(id);
    setView("team-detail");
  };

  const lookup = (id: string): TeamLike | undefined =>
    teamData?.find((t) => t.id === id);

  return (
    <>
      {/* Desktop / tablet — full table */}
      <div className={cn("hidden md:block overflow-x-auto", className)}>
        <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr className="eyebrow text-[#667085] bg-[#F4F7F3]">
              <th className="py-2.5 px-2 text-left font-semibold">Pos</th>
              <th className="py-2.5 px-3 text-left font-semibold">Ekip</th>
              <th className="py-2.5 px-2 text-center font-semibold">J</th>
              <th className="py-2.5 px-2 text-center font-semibold">G</th>
              <th className="py-2.5 px-2 text-center font-semibold">N</th>
              <th className="py-2.5 px-2 text-center font-semibold">P</th>
              {variant === "full" && (
                <th className="py-2.5 px-2 text-center font-semibold">GD</th>
              )}
              <th className="py-2.5 px-3 text-right font-semibold">PTS</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, idx) => {
              const team = lookup(r.teamId);
              if (!team) return null;
              const pos = idx + 1;
              const qualifies = pos <= qualificationZones;
              return (
                <tr
                  key={r.teamId}
                  className="border-t border-[#D0D5DD] hover:bg-[#F4F7F3] cursor-pointer transition-colors"
                  onClick={() => openTeam(r.teamId)}
                >
                  <td className="py-3 px-2">
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
                    <div className="flex items-center gap-2.5">
                      {team.logoUrl ? (
                        <img src={team.logoUrl} alt={team.name} className="w-6 h-6 object-contain" />
                      ) : (
                        <TeamCrest
                          teamId={team.id}
                          shortName={team.shortName}
                          primary={team.primaryColor}
                          secondary={team.secondaryColor}
                          size="xs"
                        />
                      )}
                      <span className="body-sm font-bold text-[#101828] truncate">{team.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center body-sm font-semibold text-[#667085] tnum">{r.played}</td>
                  <td className="py-3 px-2 text-center body-sm font-bold text-[#116B3A] tnum">{r.won}</td>
                  <td className="py-3 px-2 text-center body-sm font-semibold text-[#667085] tnum">{r.drawn}</td>
                  <td className="py-3 px-2 text-center body-sm font-semibold text-[#D92D20] tnum">{r.lost}</td>
                  {variant === "full" && (
                    <td className="py-3 px-2 text-center body-sm font-semibold text-[#667085] tnum">
                      {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                    </td>
                  )}
                  <td className="py-3 px-3 text-right">
                    <span className="score text-lg text-[#101828]">{r.points}</span>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={variant === "full" ? 8 : 7} className="py-8 text-center body-sm text-[#667085]">
                  Pa gen done klasman disponib.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile — condensed card layout */}
      <div className={cn("md:hidden divide-y divide-[#D0D5DD]", className)}>
        {shown.map((r, idx) => {
          const team = lookup(r.teamId);
          if (!team) return null;
          const pos = idx + 1;
          const qualifies = pos <= qualificationZones;
          return (
            <button
              key={r.teamId}
              onClick={() => openTeam(r.teamId)}
              className="w-full flex items-center gap-3 py-3 px-2 hover:bg-[#F4F7F3] transition-colors text-left"
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-md text-sm tnum font-bold shrink-0",
                  pos === 1
                    ? "bg-[#F4C400] text-[#084C2A]"
                    : qualifies
                    ? "bg-[#116B3A]/10 text-[#116B3A]"
                    : "text-[#667085]"
                )}
              >
                {pos}
              </span>
              {team.logoUrl ? (
                <img src={team.logoUrl} alt={team.name} className="w-6 h-6 object-contain" />
              ) : (
                <TeamCrest
                  teamId={team.id}
                  shortName={team.shortName}
                  primary={team.primaryColor}
                  secondary={team.secondaryColor}
                  size="xs"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="body-sm font-bold text-[#101828] truncate">{team.name}</p>
                <p className="meta text-[#667085] tnum">
                  J {r.played} · GD {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                </p>
              </div>
              <span className="score text-2xl text-[#101828]">{r.points}</span>
              <span className="meta text-[#667085]">PTS</span>
            </button>
          );
        })}
        {shown.length === 0 && (
          <div className="py-8 text-center body-sm text-[#667085]">
            Pa gen done klasman disponib.
          </div>
        )}
      </div>
    </>
  );
}
