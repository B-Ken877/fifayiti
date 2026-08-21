/**
 * Formatters + label helpers (domain layer).
 *
 * Pure presentational helpers that map domain enums to Haitian Creole
 * labels and format dates/times. UI text lives here so that components
 * don't have to embed Creole strings inline.
 *
 * When the database is wired, these helpers stay as-is — they're pure
 * functions over the type shape, not over the storage backend.
 */
import type { MatchStatus, PlayerStatus, TeamStatus } from "./types";

/** Map a TeamStatus enum to a Haitian Creole label. */
export function teamStatusLabels(s: TeamStatus): string {
  return {
    PRE_KREYE: "Pre-kreye",
    ENSKRIPSYON_OUVE: "Enskripsyon ouvè",
    SOUMET: "Soumèt",
    AN_VERIFIKASYON: "An verifikasyon",
    VERIFYE: "Verifye",
    AKTIF: "Aktif",
  }[s];
}

/** Map a PlayerStatus enum to a Haitian Creole label. */
export function playerStatusLabels(s: PlayerStatus): string {
  return {
    AN_ATANT: "An atant",
    VERIFYE: "Verifye",
    REFIZE: "Refize",
    DEMANDE_KOREKSYON: "Mande koreksyon",
  }[s];
}

/** Map a MatchStatus enum to a Haitian Creole label. */
export function matchStatusLabel(s: MatchStatus): string {
  return {
    PWOGRAM: "Pwogram",
    AN_DIRÈK: "An dirèk",
    FINI: "Fini",
    AN_ATANT_APWOVASYON: "An atant apwovasyon",
    REPORETE: "Reporete",
  }[s];
}

/** Day + month + time formatter — e.g. "Len 17 Out · 20:00". */
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const days = ["Dim", "Len", "Mad", "Mèk", "Jed", "Van", "Sam"];
  const months = [
    "Jan", "Fev", "Mar", "Avr", "Me", "Jun", "Jul", "Out", "Sep", "Okt",
    "Nov", "Des",
  ];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Time-only formatter — e.g. "20:00". */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}
