// FIFAYITI Server-Authoritative Match Clock Engine (Task 18).
//
// A pure state machine — no ticking needed. The authoritative clock value
// is computed on read from wall-clock time + stored accumulated time:
//
//   liveSeconds = accumulatedMs/1000 + (running ? (now - epochStartedAt)/1000 : 0)
//
// Survives server restarts (persisted to db/match-clock-state.json).
// Operator reconnects without losing time. Viewers reconnect without drift.
// The /api/livekit-room GET injects this into metadata.matchData.clock so
// viewers' scorebug shows the server-authoritative minute automatically.

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const cwd = process.cwd();
const PROJECT_ROOT = cwd.endsWith(path.join(".next", "standalone"))
  ? path.resolve(cwd, "..", "..")
  : cwd;
const STATE_FILE = path.join(PROJECT_ROOT, "db", "match-clock-state.json");

const HALF_LENGTH_SECONDS = 30 * 60; // 30 minutes per half

export interface MatchClockState {
  running: boolean;
  epochStartedAt: number; // wall-clock ms when the current running segment started
  accumulatedMs: number; // total time accumulated before the current segment
  half: string; // "PRE" | "1" | "HT" | "2" | "POST"
  stoppageSeconds: number; // additional time added by operator (e.g. 45+2)
  matchId: string | null;
  lastAction: string | null;
  lastActionAt: number;
}

function defaultState(): MatchClockState {
  return {
    running: false,
    epochStartedAt: 0,
    accumulatedMs: 0,
    half: "PRE",
    stoppageSeconds: 0,
    matchId: null,
    lastAction: null,
    lastActionAt: 0,
  };
}

async function readState(): Promise<MatchClockState> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

async function writeState(s: MatchClockState): Promise<void> {
  const dir = path.dirname(STATE_FILE);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(s, null, 2));
}

/** Compute the authoritative live clock in seconds (server-side, from wall clock). */
export function computeLiveSeconds(s: MatchClockState, now: number = Date.now()): number {
  if (!s.running) return Math.floor(s.accumulatedMs / 1000);
  return Math.floor((s.accumulatedMs + (now - s.epochStartedAt)) / 1000);
}

/** Format seconds as M:SS or MM+SS' (stoppage). */
export function formatClock(seconds: number, stoppage: number = 0): string {
  const total = seconds + stoppage * 60;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format as a minute number for the scorebug (e.g. "37'" or "45+2'"). */
export function formatMinute(seconds: number, stoppage: number = 0): string {
  const baseMin = Math.floor(seconds / 60);
  if (stoppage > 0) {
    return `${baseMin}+${stoppage}'`;
  }
  return `${baseMin}'`;
}

export async function getClockState(): Promise<MatchClockState> {
  return readState();
}

export async function getLiveClock(): Promise<{
  seconds: number;
  formatted: string;
  minute: string;
  half: string;
  running: boolean;
  stoppageSeconds: number;
}> {
  const s = await readState();
  const seconds = computeLiveSeconds(s);
  return {
    seconds,
    formatted: formatClock(seconds, s.stoppageSeconds),
    minute: formatMinute(seconds, s.stoppageSeconds),
    half: s.half,
    running: s.running,
    stoppageSeconds: s.stoppageSeconds,
  };
}

export type ClockAction =
  | "start"
  | "pause"
  | "resume_second_half"
  | "full_time"
  | "add_stoppage"
  | "reset";

export async function applyClockAction(
  action: ClockAction,
  matchId?: string,
  stoppageSeconds?: number
): Promise<MatchClockState> {
  const s = await readState();
  const now = Date.now();

  switch (action) {
    case "start":
      s.running = true;
      s.epochStartedAt = now;
      s.accumulatedMs = 0;
      s.half = "1";
      s.stoppageSeconds = 0;
      if (matchId) s.matchId = matchId;
      break;

    case "pause":
      if (s.running) {
        s.accumulatedMs += now - s.epochStartedAt;
        s.running = false;
      }
      s.half = "HT";
      break;

    case "resume_second_half":
      s.running = true;
      s.epochStartedAt = now;
      s.accumulatedMs = 0;
      s.half = "2";
      s.stoppageSeconds = 0;
      break;

    case "full_time":
      if (s.running) {
        s.accumulatedMs += now - s.epochStartedAt;
        s.running = false;
      }
      s.half = "POST";
      break;

    case "add_stoppage":
      s.stoppageSeconds = Math.max(0, (stoppageSeconds ?? 0));
      break;

    case "reset":
      Object.assign(s, defaultState());
      if (matchId) s.matchId = matchId;
      break;
  }

  s.lastAction = action;
  s.lastActionAt = now;
  await writeState(s);
  return s;
}
