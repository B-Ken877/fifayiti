"use client";

import { useEffect, useRef } from "react";
import { useNavigationStore, type ViewKey } from "@/store/navigation-store";

/**
 * NavigationHistory — bidirectional sync between the Zustand `view` state
 * and the browser's History API.
 *
 * PROBLEM this solves:
 *   The app is a SPA that uses Zustand `setView()` for all navigation. The
 *   URL never changes, so the browser's back button has no in-app history
 *   entry to go back to — it exits the site entirely (which looks like
 *   "being logged out" because the user leaves fifayiti.medikahaiti.site).
 *
 * SOLUTION:
 *   1. Every time `setView()` is called by user action, we push a new
 *      history entry containing the view + active IDs.
 *   2. When the browser fires `popstate` (user pressed back/forward), we
 *      restore the view from `event.state` WITHOUT pushing a new entry.
 *   3. This makes the phone's hardware back button and the browser back
 *      button navigate within the app instead of exiting.
 *
 * MOUNT: Once at the root layout, so it's active on every page.
 */
export function NavigationHistory() {
  const view = useNavigationStore((s) => s.view);
  const setActiveMatchId = useNavigationStore((s) => s.setActiveMatchId);
  const setActiveTeamId = useNavigationStore((s) => s.setActiveTeamId);
  const setActiveCompetitionId = useNavigationStore((s) => s.setActiveCompetitionId);

  // Refs to read latest values inside the popstate listener without
  // re-registering the listener on every state change.
  const viewRef = useRef(view);
  viewRef.current = view;

  // Track whether the current setView() call originated from a popstate
  // event — if so, we should NOT push a new history entry (the browser
  // already moved in history; we just need to sync the store).
  const suppressPushRef = useRef(false);

  // ── On mount: seed the initial history entry + register popstate listener
  useEffect(() => {
    const nav = useNavigationStore.getState();
    const initialState = {
      view: nav.view,
      activeMatchId: nav.activeMatchId,
      activeTeamId: nav.activeTeamId,
      activeCompetitionId: nav.activeCompetitionId,
    };

    // Replace the current entry (which has no state) with one that carries
    // our initial view. This way the very first "back" press has somewhere
    // to go — namely, this same view (no-op, but stays in-app).
    window.history.replaceState(initialState, "");

    const handlePopState = (e: PopStateEvent) => {
      const st = e.state as
        | { view?: ViewKey; activeMatchId?: string; activeTeamId?: string; activeCompetitionId?: string }
        | null;
      if (!st || !st.view) {
        // No state — could be the initial entry or a forward navigation
        // beyond our tracked entries. Default to home rather than exiting.
        suppressPushRef.current = true;
        useNavigationStore.getState().setView("home");
        useNavigationStore.getState().setActiveMatchId("");
        useNavigationStore.getState().setActiveTeamId("");
        useNavigationStore.getState().setActiveCompetitionId("");
        suppressPushRef.current = false;
        return;
      }
      // Restore the store from history state WITHOUT pushing a new entry.
      suppressPushRef.current = true;
      if (st.activeMatchId !== undefined) setActiveMatchId(st.activeMatchId);
      if (st.activeTeamId !== undefined) setActiveTeamId(st.activeTeamId);
      if (st.activeCompetitionId !== undefined) setActiveCompetitionId(st.activeCompetitionId);
      useNavigationStore.getState().setView(st.view);
      suppressPushRef.current = false;
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── On every view change (that didn't come from popstate): push a new
  //    history entry so the back button can return to the previous view.
  useEffect(() => {
    if (suppressPushRef.current) return; // skip — change came from popstate
    const nav = useNavigationStore.getState();
    const state = {
      view: nav.view,
      activeMatchId: nav.activeMatchId,
      activeTeamId: nav.activeTeamId,
      activeCompetitionId: nav.activeCompetitionId,
    };
    // Avoid pushing a duplicate of the current entry (would create noise).
    const cur = window.history.state;
    if (
      cur &&
      cur.view === state.view &&
      cur.activeMatchId === state.activeMatchId &&
      cur.activeTeamId === state.activeTeamId &&
      cur.activeCompetitionId === state.activeCompetitionId
    ) {
      return;
    }
    window.history.pushState(state, "");
  }, [view, setActiveMatchId, setActiveTeamId, setActiveCompetitionId]);

  // This component renders nothing — it's a side-effect-only layer.
  return null;
}
