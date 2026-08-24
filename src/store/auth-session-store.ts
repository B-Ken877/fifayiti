"use client";
/**
 * Auth session store — client-side mirror of the server-trusted session.
 *
 * The role here is a CACHE of the server-side session (read from
 * /api/auth/me on mount). The store still uses localStorage so reloads
 * don't flicker the operator through the login screen, but
 * `syncFromServer()` is called on every page mount to reconcile against
 * the server — if the server says "no session" we de-auth immediately.
 *
 * NEVER trust the client-side value for authorization. The server
 * MUST re-verify on every privileged API call (see middleware.ts +
 * /api/auth/login).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AdminRole =
  | "president"
  | "director"
  | "live_operator"
  | "cameraman"
  | "team_admin";

interface AuthSessionState {
  adminAuthed: boolean;
  setAdminAuthed: (b: boolean) => void;
  adminRole: AdminRole;
  setAdminRole: (r: AdminRole) => void;
  /** Pull the trusted role from /api/auth/me and update the store. */
  syncFromServer: () => Promise<AdminRole | null>;
}

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    (set, get) => ({
      adminAuthed: false,
      adminRole: "president",
      setAdminAuthed: (b) => set({ adminAuthed: b }),
      setAdminRole: (r) => set({ adminRole: r }),
      syncFromServer: async () => {
        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          const data = await res.json();
          if (data?.authed && data?.role) {
            set({ adminAuthed: true, adminRole: data.role as AdminRole });
            return data.role as AdminRole;
          }
          // Not authed on the server — clear local state.
          set({ adminAuthed: false });
          return null;
        } catch {
          // Network error — don't de-auth blindly, keep current state.
          return get().adminAuthed ? get().adminRole : null;
        }
      },
    }),
    {
      name: "fifayiti-auth",
      partialize: (s) => ({
        adminAuthed: s.adminAuthed,
        adminRole: s.adminRole,
      }),
    },
  ),
);
