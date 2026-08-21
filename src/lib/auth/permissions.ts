"use client";
/**
 * Permission system — client-side role/permission matrix for UX gating.
 *
 * PILOT ONLY — this is a client-side permission helper for UX gating. Real
 * authorization MUST be enforced server-side. Use this only to hide/show
 * UI; the backend MUST independently verify permissions on every
 * privileged operation.
 *
 * The role value comes from `useAuthSessionStore` (also PILOT ONLY — see
 * `src/store/auth-session-store.ts` JSDoc). In production, the role will
 * come from a server-issued session token / NextAuth session.
 *
 * Permission matrix (spec section 38):
 *   - president     → ALL permissions (full superuser)
 *   - director      → everything except `admins.manage` and `schedule.approve`
 *   - live_operator → match + replay operational permissions only
 *   - team_admin    → view-only on teams/players/schedule (own team in prod)
 */

export type Permission =
  | "competition.view" | "competition.manage"
  | "teams.view" | "teams.manage"
  | "players.view" | "players.verify"
  | "schedule.view" | "schedule.manage" | "schedule.approve"
  | "matches.view" | "matches.control" | "matches.correct"
  | "replays.view" | "replays.manage"
  | "finance.view" | "finance.manage"
  | "discipline.view" | "discipline.manage"
  | "admins.view" | "admins.manage"
  | "settings.view" | "settings.manage";

export type Role = "president" | "director" | "live_operator" | "team_admin";

const ALL_PERMISSIONS: Permission[] = [
  "competition.view", "competition.manage",
  "teams.view", "teams.manage",
  "players.view", "players.verify",
  "schedule.view", "schedule.manage", "schedule.approve",
  "matches.view", "matches.control", "matches.correct",
  "replays.view", "replays.manage",
  "finance.view", "finance.manage",
  "discipline.view", "discipline.manage",
  "admins.view", "admins.manage",
  "settings.view", "settings.manage",
];

/**
 * Role → permission matrix.
 *
 * `president` gets every permission (full superuser). `director` gets most
 * but cannot approve schedules (`schedule.approve` is president-only per
 * spec) and cannot manage admins (`admins.manage`). `live_operator` is
 * scoped to live-match operations and replays. `team_admin` is view-only
 * on teams/players/schedule (own-team scoping is enforced server-side).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  president: [...ALL_PERMISSIONS],
  director: [
    "competition.view", "competition.manage",
    "teams.view", "teams.manage",
    "players.view", "players.verify",
    "schedule.view", "schedule.manage", // NOT schedule.approve (president only)
    "matches.view", "matches.control", "matches.correct",
    "replays.view", "replays.manage",
    "finance.view", "finance.manage",
    "discipline.view", "discipline.manage",
    "admins.view", // NOT admins.manage (president only)
    "settings.view", "settings.manage",
  ],
  live_operator: [
    "matches.view", "matches.control", "matches.correct",
    "replays.view", "replays.manage",
  ],
  team_admin: [
    "teams.view",
    "players.view",
    "schedule.view",
  ],
};

/**
 * Returns true if the given role is granted the given permission.
 *
 * NOTE: This is a client-side helper for UX gating ONLY. The backend
 * MUST independently verify the role (via the session token / DB lookup)
 * on every privileged operation. A user can spoof their role in the
 * client store — never trust it for authorization.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Returns true if the role is granted ANY of the given permissions.
 * Useful for "show this nav item if the user has at least one related
 * permission" checks.
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * React hook that reads the current `adminRole` from `useAuthSessionStore`
 * and returns `hasPermission(role, permission)`.
 *
 * Re-render-safe: it subscribes to the auth-session store, so the result
 * updates immediately if the role changes mid-session (e.g. after login).
 *
 * See file-level JSDoc for the pilot-only caveat.
 */
import { useAuthSessionStore, type AdminRole } from "@/store/auth-session-store";

export function usePermission(permission: Permission): boolean {
  const adminRole = useAuthSessionStore((s) => s.adminRole);
  return hasPermission(adminRole, permission);
}

/**
 * Convenience hook returning the raw role from the auth-session store.
 * Prefer `usePermission(permission)` for gating — this is provided for
 * components that need to render different labels (e.g. "Prezidan" vs
 * "Direktè") based on role.
 */
export function useRole(): AdminRole {
  return useAuthSessionStore((s) => s.adminRole);
}
