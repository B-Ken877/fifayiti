"use client";
/**
 * Auth session store (split from app-store per spec section 40).
 *
 * PILOT ONLY — this is client-side role state. Real authentication MUST be
 * server-side. Do NOT trust this for authorization — use `hasPermission()`
 * from `@/lib/auth/permissions` for any privileged check.
 *
 * In production this store will be replaced by a NextAuth.js session
 * (read from a server-side cookie / token). The client-side `adminRole`
 * value here is for UX convenience only — the server MUST independently
 * verify the role on every privileged API call (player.verify,
 * schedule.approve, match.event.correct, etc.).
 *
 * Persistence: `adminAuthed` + `adminRole` are persisted to localStorage
 * under `fifayiti-auth` so reloads don't log the operator out. This is purely
 * UX — clearing localStorage does NOT log anyone out of the real backend
 * (because there isn't one yet in pilot). See `src/lib/auth/MOCK_NOTICE.md`.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AdminRole = "president" | "director" | "live_operator" | "team_admin";

interface AuthSessionState {
  /** Whether the operator is currently "logged in" to the admin workspace. */
  adminAuthed: boolean;
  setAdminAuthed: (b: boolean) => void;
  /** The operator's role. Used for UI gating via `usePermission()`. */
  adminRole: AdminRole;
  setAdminRole: (r: AdminRole) => void;
}

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    (set) => ({
      adminAuthed: false,
      adminRole: "president",
      setAdminAuthed: (b) => set({ adminAuthed: b }),
      setAdminRole: (r) => set({ adminRole: r }),
    }),
    {
      name: "fifayiti-auth",
      partialize: (s) => ({
        adminAuthed: s.adminAuthed,
        adminRole: s.adminRole,
      }),
    }
  )
);
