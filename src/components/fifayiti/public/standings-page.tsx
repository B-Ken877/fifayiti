"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { StandingsTable } from "./standings-table";
import { Trophy } from "lucide-react";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  group: string;
  logoUrl?: string | null;
}

interface MatchData {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: string; // "FINI" | "AN_DIRÈK" | "PWOGRAM" | ...
}

interface TeamRecord {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/** Compute team records from matches. */
function computeRecords(teams: TeamData[], matches: MatchData[]): Map<string, TeamRecord> {
  const map = new Map<string, TeamRecord>();
  for (const t of teams) {
    map.set(t.id, {
      teamId: t.id,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    });
  }
  for (const m of matches) {
    if (m.status !== "FINI" && m.status !== "AN_DIRÈK") continue;
    const home = map.get(m.homeTeamId);
    const away = map.get(m.awayTeamId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) {
      home.won++;
      away.lost++;
      home.points += 3;
    } else if (m.homeScore < m.awayScore) {
      away.won++;
      home.lost++;
      away.points += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }
  for (const r of map.values()) {
    r.goalDifference = r.goalsFor - r.goalsAgainst;
  }
  return map;
}

function sortByTiebreaker(records: TeamRecord[]): TeamRecord[] {
  return [...records].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference)
      return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return 0;
  });
}

export function StandingsPage() {
  const { setView } = useAppStore();
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

  const records = computeRecords(teams, matches);

  // Build a panel per group — discover group names dynamically from the team
  // data instead of hard-coding "A" and "B" (the platform supports any number
  // of groups, determined at competition-creation time).
  const groupNames = Array.from(
    new Set(teams.map(t => t.group).filter(Boolean).sort())
  );
  const panels = groupNames.map((g, i) => ({
    name: g,
    records: sortByTiebreaker(
      teams.filter(t => t.group === g).map(t => records.get(t.id)!)
    ).filter(Boolean),
    badgeColor: i === 0 ? "#116B3A" : i === 1 ? "#F4C400" : "#0B6B3A",
    badgeText: i === 1 ? "#084C2A" : "#FFFFFF",
  }));
  // Fallback when no team has a group label at all.
  if (panels.length === 0 && teams.length > 0) {
    panels.push({
      name: "A",
      records: sortByTiebreaker(teams.map(t => records.get(t.id)!)).filter(Boolean),
      badgeColor: "#116B3A",
      badgeText: "#FFFFFF",
    });
  }

  return (
    <div className="bg-white min-h-[60vh]">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10 lg:py-14">
        <span className="eyebrow text-[#116B3A]">Sitiyasyon aktyèl</span>
        <h1 className="display-md text-[#101828] mt-2">Klasman</h1>
        <p className="body-sm text-[#667085] mt-3 max-w-2xl">
          Estatistik yo kalkile apati match ofisyèl yo (FINI ak AN DIRÈK).
        </p>

        {loading ? (
          <div className="mt-10 py-12 text-center body-md text-[#667085]">
            Ap charger klasman an...
          </div>
        ) : teams.length === 0 ? (
          <div className="mt-10 py-12 text-center">
            <Trophy size={32} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-3 body-md text-[#667085]">
              Pa gen ekip enskri poko. Klasman ap parèt lè Prezidan ajoute ekip yo.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid lg:grid-cols-2 gap-6">
            {panels.map((p) => (
              <StandingsPanel
                key={p.name}
                title={`Gwoup ${p.name}`}
                badge={p.name}
                records={p.records}
                teamData={teams}
                badgeColor={p.badgeColor}
                badgeText={p.badgeText}
              />
            ))}
          </div>
        )}

        <div className="mt-8">
          <button onClick={() => setView("teams")} className="btn-secondary">
            ← Gade ekip yo
          </button>
        </div>
      </div>
    </div>
  );
}

function StandingsPanel({
  title, badge, records, teamData,
  badgeColor = "#116B3A", badgeText = "#FFFFFF",
}: {
  title: string;
  badge: string;
  records: TeamRecord[];
  teamData: TeamData[];
  badgeColor?: string;
  badgeText?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-7 h-7 rounded text-xs font-extrabold flex items-center justify-center tnum"
          style={{ background: badgeColor, color: badgeText }}
        >
          {badge}
        </span>
        <h2 className="heading-md text-[#101828]">{title}</h2>
      </div>
      {records.length === 0 ? (
        <div className="fifayiti-card p-6 text-center body-sm text-[#667085]">
          Pa gen ekip nan gwoup sa a poko.
        </div>
      ) : (
        <div className="fifayiti-card p-0 overflow-hidden">
          <StandingsTable variant="full" teams={records as any} teamData={teamData} />
        </div>
      )}
    </div>
  );
}
