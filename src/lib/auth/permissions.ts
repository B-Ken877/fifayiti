// Permission system — pure types + matrix (server-safe, no client imports).
//
// Originally this file was "use client" because the `usePermission` hook
// was colocated. That made it impossible to import from server code
// (API routes, middleware) without dragging React in. Now this file is
// pure data + pure functions; the React hook lives in
// `src/lib/auth/use-permission.ts` (client-only).
//
// PILOT CAVEAT: the matrix here matches the spec, but the server MUST
// independently verify role + permission on every privileged operation.
// `hasPermission(role, perm)` here is the canonical source — both
// client (via usePermission) and server (via API route handlers) call
// into this.

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

// Roles — `cameraman` is new (camera-streaming operator role).
// `live_operator` runs the broadcast control desk (slot/preview picker,
// score panel, broadcast on/off). `cameraman` connects a single camera
// feed to LiveKit. Both can read matches; cameraman has no admin
// workspace access (they never see the SPA).
export type Role =
  | "president"
  | "director"
  | "live_operator"
  | "cameraman"
  | "cameraman1"
  | "cameraman2"
  | "cameraman3"
  | "team_admin";

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
  cameraman: [
    "matches.view", // read-only — just needs to know which slot is "on TV"
  ],
  // Each cameramanN is bound to slot N (enforced by middleware + login
  // redirect). Permissions are identical to the legacy cameraman role.
  cameraman1: ["matches.view"],
  cameraman2: ["matches.view"],
  cameraman3: ["matches.view"],
  team_admin: [
    "teams.view",
    "players.view",
    "schedule.view",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
