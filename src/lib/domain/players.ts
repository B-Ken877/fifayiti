/**
 * Players service (domain layer).
 *
 * Reads players from seed data and computes per-player stats (goals /
 * yellow cards / red cards / matches played) by aggregating match events.
 *
 * When the database is wired, swap `PILOT.players` for a Prisma query
 * and `MATCHES` for a Prisma match query.
 */
import { MATCHES, PILOT } from "./seed";
import type { Player, PlayerStats } from "./types";

/** Find a player by id. */
export function playerById(id: string): Player | undefined {
  return PILOT.players.find((p) => p.id === id);
}

/** Count goals scored by a player across all played matches (excluding corrections). */
export function playerGoals(playerId: string): number {
  return MATCHES.flatMap((m) => m.events).filter(
    (e) => e.playerInId === playerId && e.kind === "GOL" && !e.correctedFrom
  ).length;
}

/** Count yellow cards shown to a player across all matches (excluding corrections). */
export function playerYellowCards(playerId: string): number {
  return MATCHES.flatMap((m) => m.events).filter(
    (e) => e.playerInId === playerId && e.kind === "KAT_JON" && !e.correctedFrom
  ).length;
}

/** Count red cards shown to a player across all matches (excluding corrections). */
export function playerRedCards(playerId: string): number {
  return MATCHES.flatMap((m) => m.events).filter(
    (e) => e.playerInId === playerId && e.kind === "KAT_WOUJ" && !e.correctedFrom
  ).length;
}

/**
 * Count matches the player appeared in — matches with status PWOGRAM /
 * AN_ATANT_APWOVASYON / REPORETE are skipped (they haven't kicked off).
 * A player is considered to have appeared if any non-corrected event
 * references them.
 */
export function playerMatchesPlayed(playerId: string): number {
  let count = 0;
  for (const m of MATCHES) {
    if (
      m.status === "PWOGRAM" ||
      m.status === "AN_ATANT_APWOVASYON" ||
      m.status === "REPORETE"
    )
      continue;
    if (m.events.some((e) => e.playerInId === playerId && !e.correctedFrom))
      count++;
  }
  return count;
}

/** All four player stats at once. Derived from match events. */
export function computePlayerStats(playerId: string): PlayerStats {
  return {
    goals: playerGoals(playerId),
    yellowCards: playerYellowCards(playerId),
    redCards: playerRedCards(playerId),
    matchesPlayed: playerMatchesPlayed(playerId),
  };
}

/** Players whose identity verification is still pending (status AN_ATANT). */
export function playersPendingVerification(): Player[] {
  return PILOT.players.filter((p) => p.status === "AN_ATANT");
}
