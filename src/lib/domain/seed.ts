/**
 * FIFAYITI domain data — EMPTY STATE.
 *
 * All pilot/seed data has been removed. The federation admin (Prezidan)
 * will manually enter teams, players, and matches through the admin UI.
 *
 * The PILOT/VENUES/REPLAYS/MATCHES exports remain as empty arrays so the
 * existing imports in `teams.ts` / `players.ts` / `matches.ts` / `replays.ts`
 * keep working — but the service modules have been migrated to read from
 * the Prisma database (`src/lib/db.ts`). These empty exports are now just
 * fallbacks for the rare synchronous call paths.
 *
 * When the database is wired (Prisma + SQLite), all reads go through
 * `db.team.findMany(...)`, `db.player.findMany(...)`, etc.
 */
import type {
  Match,
  Player,
  Replay,
  TeamBase,
  Venue,
} from "./types";

/** Empty — no pilot teams. The admin enters them via the UI. */
export const PILOT: { teams: TeamBase[]; players: Player[] } = {
  teams: [],
  players: [],
};

/** Empty — no preset venues. */
export const VENUES: Venue[] = [];

/** Empty — no preset replays. */
export const REPLAYS: Replay[] = [];

/** Empty — no preset matches. The admin schedules them via the UI. */
export const MATCHES: Match[] = [];
