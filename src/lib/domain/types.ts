/**
 * FIFAYITI domain types.
 *
 * All type definitions for the federation domain model. Pure type module
 * — no runtime values. Imported by `seed.ts` (empty), by the service
 * modules (`teams.ts`, `players.ts`, `matches.ts`, `replays.ts`,
 * `formatters.ts`), and re-exported from `index.ts` for backwards-compat
 * with `src/lib/fifayiti-data.ts`.
 *
 * The shape of these types matches the Prisma model in
 * `prisma/schema.prisma`.
 */

/** Team registration lifecycle. */
export type TeamStatus =
  | "PRE_KREYE"
  | "ENSKRIPSYON_OUVE"
  | "SOUMET"
  | "AN_VERIFIKASYON"
  | "VERIFYE"
  | "AKTIF";

/** Player identity verification status. */
export type PlayerStatus =
  | "AN_ATANT"
  | "VERIFYE"
  | "REFIZE"
  | "DEMANDE_KOREKSYON";

/** On-field player position. */
export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export interface Player {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: PlayerPosition;
  dateOfBirth: string;
  idNumber: string;
  /** Two-letter initials (avatar fallback when no photoUrl is set). */
  photo: string;
  /** Optional photo URL — admin can upload a player headshot. */
  photoUrl?: string;
  status: PlayerStatus;
  submittedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface TeamBase {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  founded: string;
  homeVenue: string;
  venueAddress: string;
  venueRouter?: string;
  venueConnectivity?: "BON" | "MOYEN" | "FEBL";
  status: TeamStatus;
  registeredAt: string;
  /** Player ids on this team's roster. */
  players: string[];
  group: "A" | "B";
  /** Optional custom logo URL (admin upload). Fallback: generated TeamCrest. */
  logoUrl?: string;
  /** Optional team photo URL. */
  photoUrl?: string;
}

/**
 * Computed team record — derived ENTIRELY from matches. No hard-coded stats.
 * The standings table sorts by points, then goal difference, then goals for.
 */
export interface TeamRecord {
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

/** Lifecycle of a scheduled match. */
export type MatchStatus =
  | "PWOGRAM"
  | "AN_DIRÈK"
  | "FINI"
  | "AN_ATANT_APWOVASYON"
  | "REPORETE";

/**
 * Kind of event recorded during a match.
 * Phase events (KOMANSE / MWATYE_TAN / DEZYEM_MITAN / FEN_MATCH) carry no
 * team/player; flow events (GOL / FOT / KAT_JON / KAT_WOUJ / RANPLASMAN / KONÈ) do.
 */
export type MatchEventKind =
  | "GOL"
  | "KAT_JON"
  | "KAT_WOUJ"
  | "RANPLASMAN"
  | "FOT"
  | "KONÈ"
  | "KOMANSE"
  | "MWATYE_TAN"
  | "DEZYEM_MITAN"
  | "FEN_MATCH";

export interface MatchEvent {
  id: string;
  matchId: string;
  minute: number;
  half: 1 | 2;
  kind: MatchEventKind;
  teamId?: string;
  playerInId?: string;
  playerOutId?: string;
  description: string;
  recordedBy: string;
  recordedAt: string;
  /** Id of the event this one corrects (set when this is a correction record). */
  correctedFrom?: string;
  correctionNote?: string;
}

/** Competition stages supported by the 6-team pilot. R16/QF omitted until scale. */
export type CompetitionStage = "GROUP" | "SF" | "FIN";

export interface Match {
  id: string;
  matchday: number;
  group?: "A" | "B";
  stage?: CompetitionStage;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string;
  venue: string;
  competition: string;
  status: MatchStatus;
  referee?: string;
  commissioner?: string;
  /** Seconds elapsed in current half (chronometer mode). */
  clock?: number;
  half?: 1 | 2 | "HT" | "PRE" | "POST" | string;
  events: MatchEvent[];
  replayIds: string[];
  synced: boolean;
}

export type ReplayKind = "GOL" | "SAV" | "KADON" | "SUBSTITUSYON" | "KAT";

export interface Replay {
  id: string;
  matchId: string;
  title: string;
  playerId?: string;
  teamId?: string;
  kind: ReplayKind;
  minute: number;
  savedAt: string;
  thumbnail: string;
  permanent: true;
}

export type VenueConnectivity = "BON" | "MOYEN" | "FEBL";

export interface Venue {
  id: string;
  name: string;
  address: string;
  isp: string;
  router: string;
  connectivity: VenueConnectivity;
  bandwidthMbps: number;
}

/** Computed player stats — derived ENTIRELY from match events. */
export interface PlayerStats {
  goals: number;
  yellowCards: number;
  redCards: number;
  matchesPlayed: number;
}

/** Backwards-compat alias — `Team` was the original public name. */
export type Team = TeamBase;
