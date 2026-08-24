"use client";
// React hook that reads role from auth-session-store and exposes
// hasPermission(role, permission). Client-only.
//
// (Split out of permissions.ts so that file is pure data/functions and
// server-safe to import from API routes.)

import { hasPermission, type Permission, type Role } from "./permissions";
import { useAuthSessionStore, type AdminRole } from "@/store/auth-session-store";

export function usePermission(permission: Permission): boolean {
  const adminRole = useAuthSessionStore((s) => s.adminRole);
  return hasPermission(adminRole as Role, permission);
}

export function useRole(): AdminRole {
  return useAuthSessionStore((s) => s.adminRole);
}
