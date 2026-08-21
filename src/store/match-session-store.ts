"use client";
/**
 * Match session store (split from app-store per spec section 40).
 *
 * Live operator state for the match-control screen:
 *   - `online` — whether the operator's client currently has connectivity
 *     to the FIFAYITI server (used to toggle the offline-replay buffer UI)
 *   - `pendingSync` — number of match events queued locally awaiting
 *     sync to the server while offline
 *
 * NOT persisted. This is operational state that should reset on every
 * page reload — a stale "pendingSync: 47" from yesterday's match would
 * be misleading when a new operator starts a new session.
 */
import { create } from "zustand";

interface MatchSessionState {
  online: boolean;
  setOnline: (b: boolean) => void;
  pendingSync: number;
  setPendingSync: (n: number) => void;
}

export const useMatchSessionStore = create<MatchSessionState>()((set) => ({
  online: true,
  setOnline: (b) => set({ online: b }),
  pendingSync: 0,
  setPendingSync: (n) => set({ pendingSync: n }),
}));
