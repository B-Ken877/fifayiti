/**
 * Matches service (domain layer).
 *
 * Reads matches from seed data and provides status-based accessors:
 * live, upcoming, finished, today's, and pending president approval.
 * Also exposes `replaysForMatch` since replays are primarily accessed
 * via the match they belong to.
 *
 * When the database is wired, swap `MATCHES` and `REPLAYS` for Prisma queries.
 */
import { MATCHES, REPLAYS } from "./seed";
import type { Match, Replay } from "./types";

/** Find a match by id. */
export function matchById(id: string): Match | undefined {
  return MATCHES.find((m) => m.id === id);
}

/** The currently live match (status AN_DIRÈK), if any. */
export function liveMatch(): Match | undefined {
  return MATCHES.find((m) => m.status === "AN_DIRÈK");
}

/** Upcoming matches (status PWOGRAM), sorted by kickoff ascending. */
export function upcomingMatches(): Match[] {
  return MATCHES.filter((m) => m.status === "PWOGRAM").sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );
}

/** Finished matches (status FINI). */
export function finishedMatches(): Match[] {
  return MATCHES.filter((m) => m.status === "FINI");
}

/** Matches kicking off today (UTC date match against kickoff date). */
export function todaysMatches(): Match[] {
  const today = new Date().toISOString().slice(0, 10);
  return MATCHES.filter((m) => m.kickoff.slice(0, 10) === today);
}

/** Matches awaiting president approval (status AN_ATANT_APWOVASYON). */
export function pendingApprovalMatches(): Match[] {
  return MATCHES.filter((m) => m.status === "AN_ATANT_APWOVASYON");
}

/** All matches in the order they appear in the seed. */
export function allMatches(): Match[] {
  return MATCHES;
}

/** Replays attached to a specific match. */
export function replaysForMatch(matchId: string): Replay[] {
  return REPLAYS.filter((r) => r.matchId === matchId);
}
