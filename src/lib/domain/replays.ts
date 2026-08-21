/**
 * Replays service (domain layer).
 *
 * Reads saved replays from seed data. Replays are permanent clips
 * (gols / saves / cards / substitutions) attached to a match.
 *
 * When the database is wired, swap `REPLAYS` for a Prisma query.
 */
import { REPLAYS } from "./seed";
import type { Replay } from "./types";

/** All permanent replays in the seed. */
export function allReplays(): Replay[] {
  return REPLAYS;
}
