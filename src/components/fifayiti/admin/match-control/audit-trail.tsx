"use client";
import { type LocalEvent } from "./types";
import { useAuditLog, type AuditAction, type AuditRecord } from "@/lib/audit/audit-log";
import { Ban } from "lucide-react";

/**
 * Audit action → Creole label (match-side subset).
 * Pilot: only match-event actions are shown here. Player/schedule actions
 * are handled by their own pages.
 */
function matchActionLabel(action: AuditAction): string {
  return {
    "match.start": "Kòmanse",
    "match.halftime": "Mwatye tan",
    "match.second_half": "Dezyèm mitan",
    "match.end": "Fen match",
    "match.event.record": "Evenman anrejistre",
    "match.event.correct": "Koreksyon",
  }[action] ?? action;
}

/** Format ISO timestamp as HH:MM:SS for display. */
function formatAuditTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * MatchAuditTrail — renders two things:
 *
 *  1. The strikethrough + correction note for THIS event (when `event.corrected`
 *     is true). This is the per-event correction display used inside the
 *     MatchEventTimeline row.
 *
 *  2. A small "recent audit records for this match" sub-list, sourced from
 *     the centralized audit log (`useAuditLog({ targetType: "match" })`).
 *
 *     In the pilot this list is empty (the match-control page does not call
 *     `recordAudit()` — that wiring belongs in the parent and is out of
 *     scope for this hardening pass). In production, every match-phase
 *     transition + every event record + every correction MUST call
 *     `recordAudit({ action: "match.event.record" | ..., target: matchId,
 *     targetType: "match" })`, and those records will appear here.
 *
 *     NOTE: this is a read-only display. The backend MUST also persist the
 *     audit record to the `AuditLog` Prisma table for regulatory evidence.
 */
export function MatchAuditTrail({
  event,
}: {
  event: LocalEvent;
}) {
  // Pull recent match audit records for THIS match (by matchId).
  const matchRecords: AuditRecord[] = useAuditLog({
    targetType: "match",
    target: event.matchId,
    limit: 5,
  });

  return (
    <div className="space-y-1">
      {/* Per-event correction note (preserved from original component). */}
      {event.corrected && event.correctionNote && (
        <p className="meta font-bold text-[#D92D20] mt-0.5 inline-flex items-center gap-1">
          <Ban size={11} /> Korije: {event.correctionNote}
        </p>
      )}

      {/* Recent audit records for this match (empty in pilot — see JSDoc). */}
      {matchRecords.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {matchRecords.map((r) => (
            <li
              key={r.id}
              className="meta text-[#667085] flex items-center gap-1.5"
            >
              <Ban size={10} className="text-[#667085]" />
              <span className="font-bold text-[#084C2A]">
                {matchActionLabel(r.action)}
              </span>
              <span>·</span>
              <span>{r.actor}</span>
              <span>·</span>
              <span className="tnum font-mono">
                {formatAuditTime(r.timestamp)}
              </span>
              {r.reason && (
                <>
                  <span>·</span>
                  <span className="truncate">{r.reason}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
