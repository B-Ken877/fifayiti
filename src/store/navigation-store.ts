"use client";
/**
 * Navigation store.
 *
 * Purely client-side UI navigation state.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewKey =
  | "home"
  | "tv"
  | "match"
  | "teams"
  | "team-detail"
  | "players"
  | "standings"
  | "tournament"
  | "replays"
  | "betting"
  | "betting-login"
  | "betting-wallet"
  | "betting-operator"
  | "admin-login"
  | "admin-dashboard"
  | "admin-teams"
  | "admin-team-detail"
  | "admin-players"
  | "admin-competitions"
  | "admin-schedule"
  | "admin-match-control"
  | "admin-replays"
  | "admin-finances"
  | "admin-discipline"
  | "admin-admins"
  | "admin-settings";

interface NavigationState {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  activeMatchId: string;
  activeTeamId: string;
  activeCompetitionId: string;
  setActiveMatchId: (id: string) => void;
  setActiveTeamId: (id: string) => void;
  setActiveCompetitionId: (id: string) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (b: boolean) => void;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      view: "home",
      setView: (v) => set({ view: v }),
      activeMatchId: "",
      activeTeamId: "",
      activeCompetitionId: "",
      setActiveMatchId: (id) => set({ activeMatchId: id }),
      setActiveTeamId: (id) => set({ activeTeamId: id }),
      setActiveCompetitionId: (id) => set({ activeCompetitionId: id }),
      mobileNavOpen: false,
      setMobileNavOpen: (b) => set({ mobileNavOpen: b }),
    }),
    {
      name: "fifayiti-nav",
      partialize: (s) => ({ view: s.view }),
    }
  )
);
