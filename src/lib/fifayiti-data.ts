/**
 * FIFAYITI domain data. Currently backed by seed fixtures (`./domain/seed.ts`).
 * When a database is wired, replace seed imports with Prisma queries —
 * UI should not know the difference.
 *
 * This file is a thin re-export of `./domain/index.ts`. It exists only so
 * that existing imports of `@/lib/fifayiti-data` keep working — new code should
 * import from `@/lib/domain` directly (or from one of the focused modules
 * like `@/lib/domain/teams` for tree-shaking).
 *
 * See:
 *   - `./domain/types.ts`      — type definitions
 *   - `./domain/seed.ts`       — PILOT fixtures (teams, players, matches, replays, venues)
 *   - `./domain/teams.ts`      — team service (records, standings)
 *   - `./domain/players.ts`    — player service (goals, cards, matches played)
 *   - `./domain/matches.ts`    — match service (live, upcoming, finished, etc.)
 *   - `./domain/replays.ts`    — replay service
 *   - `./domain/formatters.ts` — Haitian Creole label + date/time helpers
 */
export * from "./domain/index";
