/**
 * Teams service (domain layer).
 *
 * Reads teams from seed data and computes team records (played / W / D / L /
 * GF / GA / GD / PTS) by aggregating match results. Standings are derived
 * ENTIRELY from matches — no hard-coded stats.
 *
 * When the database is wired, swap `PILOT.teams` for a Prisma query and
 * swap `MATCHES` for a Prisma match query — the function signatures
 * stay the same so UI components don't need to change.
 */
import { MATCHES, PILOT } from "./seed";
import type { TeamBase, TeamRecord } from "./types";

/** Find a team by id. */
export function teamById(id: string): TeamBase | undefined {
  return PILOT.teams.find((t) => t.id === id);
}

/** All pilot teams, in seed order. */
export function allTeams(): TeamBase[] {
  return PILOT.teams;
}

/**
 * Compute a team's record — derived from FINI + AN_DIRÈK matches only.
 * Matches in PWOGRAM / AN_ATANT_APWOVASYON / REPORETE don't count.
 */
export function computeTeamRecord(teamId: string): TeamRecord {
  let played = 0,
    won = 0,
    drawn = 0,
    lost = 0,
    goalsFor = 0,
    goalsAgainst = 0;
  for (const m of MATCHES) {
    if (m.status !== "FINI" && m.status !== "AN_DIRÈK") continue;
    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    played++;
    const myGoals = isHome ? m.homeScore : m.awayScore;
    const oppGoals = isHome ? m.awayScore : m.homeScore;
    goalsFor += myGoals;
    goalsAgainst += oppGoals;
    if (myGoals > oppGoals) won++;
    else if (myGoals < oppGoals) lost++;
    else drawn++;
  }
  const points = 3 * won + 1 * drawn;
  return {
    teamId,
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    points,
  };
}

/** Records for every pilot team, in seed order. */
export function allTeamRecords(): TeamRecord[] {
  return PILOT.teams.map((t) => computeTeamRecord(t.id));
}

/**
 * Standings — sorted with proper football tiebreakers:
 *   1. Points (desc)
 *   2. Goal difference (desc)
 *   3. Goals for (desc)
 *   4. (Stable — preserves group order for ties fully equal)
 */
export function standings(): TeamRecord[] {
  return [...allTeamRecords()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference)
      return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return 0;
  });
}

/** Standings filtered to a single group (A or B). */
export function standingsByGroup(group: "A" | "B"): TeamRecord[] {
  return standings().filter((r) => teamById(r.teamId)?.group === group);
}
