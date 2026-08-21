/**
 * FIFAYITI domain layer barrel.
 *
 * Re-exports the public API of all domain modules so that callers can
 * do `import { teamById, type Match } from "@/lib/domain"` (or, for
 * backwards compat, `from "@/lib/fifayiti-data"`).
 *
 * When the database is wired (Prisma), the modules in this folder will
 * internally swap seed imports for Prisma queries — this barrel's shape
 * stays the same, so UI components don't need to change.
 */
export type {
  CompetitionStage,
  Match,
  MatchEvent,
  MatchEventKind,
  MatchStatus,
  Player,
  PlayerPosition,
  PlayerStats,
  PlayerStatus,
  Replay,
  ReplayKind,
  Team,
  TeamBase,
  TeamRecord,
  TeamStatus,
  Venue,
  VenueConnectivity,
} from "./types";

export { PILOT, VENUES, REPLAYS, MATCHES } from "./seed";

export {
  teamById,
  allTeams,
  computeTeamRecord,
  allTeamRecords,
  standings,
  standingsByGroup,
} from "./teams";

export {
  playerById,
  playerGoals,
  playerYellowCards,
  playerRedCards,
  playerMatchesPlayed,
  computePlayerStats,
  playersPendingVerification,
} from "./players";

export {
  matchById,
  liveMatch,
  upcomingMatches,
  finishedMatches,
  todaysMatches,
  pendingApprovalMatches,
  allMatches,
  replaysForMatch,
} from "./matches";

export { allReplays } from "./replays";

export {
  formatKickoff,
  formatTime,
  matchStatusLabel,
  teamStatusLabels,
  playerStatusLabels,
} from "./formatters";
