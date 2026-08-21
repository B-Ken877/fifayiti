"use client";
/**
 * Legacy combined app store — backwards-compatibility shim only.
 *
 * The original monolithic store was split (spec section 40) into three
 * focused stores:
 *   - `useNavigationStore`  — view + active match/team + mobile nav (persisted)
 *   - `useMatchSessionStore`— live operator online / pending-sync (NOT persisted)
 *   - `useAuthSessionStore` — adminAuthed + adminRole (persisted, PILOT only)
 *
 * New code should import from the specific stores. This file keeps the
 * `useAppStore` export so existing components that destructure multiple
 * slices (`{ view, adminAuthed, online, ... } = useAppStore()`) continue
 * to work during the migration. The combined hook subscribes to all
 * three underlying stores — any change in any of them triggers a
 * re-render of legacy consumers.
 *
 * Imperative callers using `useAppStore.getState().setView(...)` (used in
 * `src/components/fifayiti/match/match-page.tsx`) keep working because the
 * returned snapshot contains the actual setter functions from the split
 * stores (which are bound to their respective stores).
 *
 * DO NOT add new slices to this store. Add new slices to the appropriate
 * focused store instead.
 */
import { useNavigationStore } from "./navigation-store";
import { useMatchSessionStore } from "./match-session-store";
import { useAuthSessionStore } from "./auth-session-store";

export type { ViewKey } from "./navigation-store";
export type { AdminRole } from "./auth-session-store";

/** Legacy combined hook. Returns a merged snapshot of all three split stores. */
export function useAppStore() {
  const nav = useNavigationStore();
  const session = useMatchSessionStore();
  const auth = useAuthSessionStore();
  return { ...nav, ...session, ...auth };
}

/**
 * Imperative state accessor — used by call sites that read state outside
 * a React render (e.g. event handlers in `match-page.tsx`). Returns a
 * snapshot of the merged state. The setter functions inside the snapshot
 * are the actual setters from the split stores, so calling
 * `useAppStore.getState().setView("home")` routes to `useNavigationStore`.
 */
useAppStore.getState = () => ({
  ...useNavigationStore.getState(),
  ...useMatchSessionStore.getState(),
  ...useAuthSessionStore.getState(),
});
