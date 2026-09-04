// FIFAYITI — centralized authorization layer.
//
// All role/permission checks go through this module. Never scatter
// `role === "president" || ...` strings across the codebase — import
// the helpers here so the permission matrix lives in ONE place and can
// be audited + changed without hunting for call sites.
//
// PERMISSION MATRIX (server-enforced):
//
//   canCreateOfficialMatchEvent  → LIVE_OPERATOR only
//   canManageBettingMarkets      → BETTING_OPERATOR only
//   canTriggerEmergencySuspend   → BETTING_OPERATOR + PRESIDENT + DIRECTOR
//   canManageWallet              → the bettor themselves (id checked at call site)
//   canManageSystem              → ADMIN (PRESIDENT)
//   canSettleMarket              → SYSTEM only (settlement engine — never a human)
//
// IMPORTANT: PRESIDENT / DIRECTOR are federation administrators. They can
// oversee the platform but they CANNOT create official match events or
// publish betting markets — those are operational roles with their own
// accountability. PRESIDENT/DIRECTOR CAN trigger emergency betting suspension
// (kill switch for risk).

import type { FifayitiRole } from "./credentials";

// ── Approved official event catalog (spec P0.1) ──────────────────────
// The live operator may ONLY create these event types. The events route
// rejects anything else with 400.
export const OFFICIAL_EVENT_TYPES = [
  "MATCH_STARTED",
  "GOL",
  "GOAL_CANCELLED",
  "YELLOW_CARD",
  "KAT_JON",          // legacy alias for YELLOW_CARD (existing data uses this)
  "RED_CARD",
  "KAT_WOUJ",         // legacy alias for RED_CARD
  "SUBSTITUTION",
  "RANPLASMAN",       // legacy alias for SUBSTITUTION
  "PENALTY_AWARDED",
  "PENALTY_SCORED",
  "PENALTY_MISSED",
  "KOMANSE",          // legacy alias for MATCH_STARTED
  "HALF_TIME",
  "MWATYE_TAN",       // legacy alias for HALF_TIME
  "SECOND_HALF_STARTED",
  "DEZYEM_MITAN",     // legacy alias for SECOND_HALF_STARTED
  "MATCH_PAUSED",
  "MATCH_RESUMED",
  "MATCH_ENDED",
  "FEN_MATCH",        // legacy alias for MATCH_ENDED
  "MATCH_ABANDONED",
  "FOT",              // foul (existing)
  "KONÈ",             // corner (existing)
] as const;

export type OfficialEventType = (typeof OFFICIAL_EVENT_TYPES)[number];

/** Validate that a string is an approved official event type. */
export function isValidEventType(t: string): t is OfficialEventType {
  return (OFFICIAL_EVENT_TYPES as readonly string[]).includes(t);
}

// ── Permission checks ─────────────────────────────────────────────────

/** LIVE_OPERATOR only — can create/confirm/correct official match events. */
export function canCreateOfficialMatchEvent(role: FifayitiRole | null): boolean {
  return role === "live_operator";
}

/** BETTING_OPERATOR only — can publish/suspend/close/cancel betting markets. */
export function canManageBettingMarkets(role: FifayitiRole | null): boolean {
  return role === "betting_operator";
}

/**
 * Emergency betting suspension kill-switch.
 * BETTING_OPERATOR (their desk) + PRESIDENT + DIRECTOR (federation admins
 * can kill betting during a crisis). This is the ONLY betting operation
 * PRESIDENT/DIRECTOR can perform — they cannot create/publish markets.
 */
export function canTriggerEmergencySuspend(role: FifayitiRole | null): boolean {
  return role === "betting_operator" || role === "president" || role === "director";
}

/** System-only settlement. NEVER a human role — the settlement engine calls this. */
export function canSettleMarket(role: FifayitiRole | null): boolean {
  return false; // humans never settle; the engine does it on official events
}

/** ADMIN operations (user admin, system config, audit access). */
export function canManageSystem(role: FifayitiRole | null): boolean {
  return role === "president" || role === "director";
}

/** Camera operator — can access their assigned camera slot only. */
export function canOperateCamera(role: FifayitiRole | null): boolean {
  return role === "cameraman" || role === "cameraman1" ||
         role === "cameraman2" || role === "cameraman3" ||
         role === "live_operator" || role === "president" || role === "director";
}

// ── SIPÒ (Team Support) permissions ──────────────────────────────────

/** PRESIDENT + DIRECTOR — can create + execute team support distributions. */
export function canManageDistributions(role: FifayitiRole | null): boolean {
  return role === "president" || role === "director";
}

/** TEAM_ADMIN — can VIEW their team's support fund + distributions (read-only). */
export function canViewTeamSupport(role: FifayitiRole | null): boolean {
  return role === "team_admin" || role === "president" || role === "director";
}

/** Standardized 401 response for unauthenticated requests. */
export const UNAUTHORIZED = { status: 401, error: "Ou pa otorize." } as const;
/** Standardized 403 response for insufficient role. */
export const FORBIDDEN = { status: 403, error: "Ou pa gen dwa pou aksyon sa a." } as const;
