import {
  type MatchEvent,
  type MatchEventKind,
  type Team,
  type Player,
} from "@/lib/fifayiti-data";
import {
  Goal,
  Square,
  SquareArrowUp,
  Repeat,
  Play,
  Pause,
  Flag,
} from "lucide-react";
import type * as React from "react";

/** LocalEvent — extends MatchEvent with correction metadata. */
export interface LocalEvent extends MatchEvent {
  corrected?: boolean;
  correctionNote?: string;
}

/** KIND_META — label, icon, color, and bg per event kind. */
export const KIND_META: Record<
  MatchEventKind,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  GOL: { label: "Gòl", icon: Goal, color: "#116B3A", bg: "#116B3A" },
  KAT_JON: { label: "Kat jòn", icon: Square, color: "#F4C400", bg: "#F4C400" },
  KAT_WOUJ: { label: "Kat wouj", icon: SquareArrowUp, color: "#D92D20", bg: "#D92D20" },
  RANPLASMAN: { label: "Ranplasman", icon: Repeat, color: "#667085", bg: "#667085" },
  KOMANSE: { label: "Kòmanse", icon: Play, color: "#116B3A", bg: "#116B3A" },
  MWATYE_TAN: { label: "Mwatye tan", icon: Pause, color: "#F4C400", bg: "#F4C400" },
  DEZYEM_MITAN: { label: "Dezyèm mitan", icon: Play, color: "#116B3A", bg: "#116B3A" },
  FOT: { label: "Fot", icon: Flag, color: "#F97316", bg: "#F97316" },
  KONÈ: { label: "Kònè", icon: Flag, color: "#667085", bg: "#667085" },
  FEN_MATCH: { label: "Fen match", icon: Flag, color: "#D92D20", bg: "#D92D20" },
};

/** Control buttons — match state transitions (64px min-height). */
export const CONTROL_BUTTONS: {
  kind: MatchEventKind;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { kind: "KOMANSE", label: "Kòmanse", icon: Play, color: "#116B3A" },
  { kind: "MWATYE_TAN", label: "Mwatye tan", icon: Pause, color: "#F4C400" },
  { kind: "DEZYEM_MITAN", label: "Dezyèm mitan", icon: Play, color: "#116B3A" },
  { kind: "FEN_MATCH", label: "Fen match", icon: Flag, color: "#D92D20" },
];

/** Event buttons — operational actions during play (80px min-height, 28px icons). */
export const EVENT_BUTTONS: {
  kind: MatchEventKind;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { kind: "GOL", label: "Gòl", icon: Goal, color: "#116B3A" },
  { kind: "KAT_JON", label: "Kat jòn", icon: Square, color: "#F4C400" },
  { kind: "KAT_WOUJ", label: "Kat wouj", icon: SquareArrowUp, color: "#D92D20" },
  { kind: "RANPLASMAN", label: "Ranplasman", icon: Repeat, color: "#667085" },
  { kind: "FOT", label: "Fot", icon: Flag, color: "#F97316" },
  { kind: "KONÈ", label: "Kònè", icon: Flag, color: "#667085" },
];

/** Kinds that don't need team/player selection (no-team events). */
export const NO_TEAM_KINDS: MatchEventKind[] = [
  "KOMANSE",
  "MWATYE_TAN",
  "DEZYEM_MITAN",
  "FEN_MATCH",
];

/** Build a human-readable description for an event. */
export function buildDescription(
  kind: MatchEventKind,
  team?: Team,
  playerIn?: Player,
  playerOut?: Player
): string {
  const teamName = team?.name ?? "";
  const inName = playerIn ? `${playerIn.firstName} ${playerIn.lastName}` : "";
  const outName = playerOut ? `${playerOut.firstName} ${playerOut.lastName}` : "";
  switch (kind) {
    case "GOL":
      return `Gòl — ${inName} (${teamName})`;
    case "KAT_JON":
      return `Kat jòn — ${inName} (${teamName})`;
    case "KAT_WOUJ":
      return `Kat wouj — ${inName} (${teamName})`;
    case "RANPLASMAN":
      return `Ranplasman — ${inName} ⇄ ${outName} (${teamName})`;
    case "KOMANSE":
      return "Match kòmanse — 1ye mitan";
    case "MWATYE_TAN":
      return "Mwatye tan";
    case "DEZYEM_MITAN":
      return "Dezyèm mitan kòmanse";
    case "FOT":
      return `Fot — ${teamName}`;
    case "KONÈ":
      return `Kònè — ${teamName}`;
    case "FEN_MATCH":
      return "Fen match";
    default:
      return kind;
  }
}
