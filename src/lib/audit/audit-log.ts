"use client";
/**
 * Audit log — centralized record of every privileged admin action.
 *
 * In the PILOT, this is an in-memory store backed by Zustand. Records
 * survive for the duration of the page session (lost on reload). The
 * intent is to demonstrate the audit-log architecture and let UI pages
 * (player-verification, schedule, match-control audit trail) consume a
 * single source of truth instead of each keeping a local useState log.
 *
 * PRODUCTION: each `recordAudit()` call MUST be replaced by a POST to
 * `/api/audit` (a server endpoint that writes an immutable record to
 * the `AuditLog` Prisma table — see `prisma/schema.prisma`). The server
 * enforces:
 *   - the actor is authenticated
 *   - the actor has the permission for the action
 *   - the record is append-only (no updates, no deletes)
 *   - previousState / newState are stored as JSON snapshots
 *
 * The hook `useAuditLog()` reads recent records from the in-memory store
 * for display in admin UI. It does NOT enforce anything — it's a view.
 */
import { create } from "zustand";

export type AuditTargetType =
  | "player"
  | "match"
  | "schedule"
  | "team"
  | "replay"
  | "finance"
  | "admin"
  | "discipline";

export type AuditAction =
  | "player.verify"
  | "player.refuse"
  | "player.request_correction"
  | "schedule.approve"
  | "schedule.refuse"
  | "match.start"
  | "match.halftime"
  | "match.second_half"
  | "match.end"
  | "match.event.record"
  | "match.event.correct"
  | "replay.save"
  | "replay.view"
  | "finance.payment"
  | "finance.adjustment"
  | "admin.create"
  | "admin.remove"
  | "admin.role_change"
  | "team.create"
  | "team.status_change";

export interface AuditRecord {
  id: string;
  /** Admin user id (or role placeholder in pilot, e.g. "president"). */
  actor: string;
  /** What happened — see `AuditAction` enum above. */
  action: AuditAction;
  /** Entity id the action targeted (player id, match id, etc.). */
  target: string;
  /** Kind of entity targeted — used by UI to filter the audit log. */
  targetType: AuditTargetType;
  /** JSON snapshot of the entity BEFORE the change. */
  previousState?: string;
  /** JSON snapshot of the entity AFTER the change. */
  newState?: string;
  /** Free-text reason (especially for corrections and refusals). */
  reason?: string;
  /** ISO timestamp — set by `recordAudit()`, never by the caller. */
  timestamp: string;
}

/** Returns a fresh unique id for an audit record. */
function makeAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface AuditStore {
  /** Reverse-chronological list — newest first. */
  records: AuditRecord[];
  /** Append a record (called by `recordAudit()`). */
  push: (record: AuditRecord) => void;
}

const auditStore = create<AuditStore>((set) => ({
  records: [],
  push: (record) =>
    set((s) => ({ records: [record, ...s.records].slice(0, 500) })),
}));

/**
 * Append-only audit recorder. The record's `id` + `timestamp` are set
 * here — callers only supply the action-specific fields.
 *
 * PILOT: records are kept in-memory only (cleared on page reload).
 * PRODUCTION: POST to `/api/audit` so the record lands in the immutable
 * `AuditLog` table — DO NOT just rely on this store for evidence.
 */
export function recordAudit(
  entry: Omit<AuditRecord, "id" | "timestamp">
): AuditRecord {
  const record: AuditRecord = {
    ...entry,
    id: makeAuditId(),
    timestamp: new Date().toISOString(),
  };
  auditStore.getState().push(record);
  return record;
}

/**
 * React hook that returns recent audit records. By default, returns all
 * records (newest first). Optionally filter by `targetType` and/or `target`
 * so a single page (e.g. player verification) can show only its own actions.
 */
export function useAuditLog(opts?: {
  targetType?: AuditTargetType;
  target?: string;
  limit?: number;
}): AuditRecord[] {
  const records = auditStore((s) => s.records);
  let filtered = records;
  if (opts?.targetType) {
    filtered = filtered.filter((r) => r.targetType === opts.targetType);
  }
  if (opts?.target) {
    filtered = filtered.filter((r) => r.target === opts.target);
  }
  if (opts?.limit && opts.limit > 0) {
    filtered = filtered.slice(0, opts.limit);
  }
  return filtered;
}

/** Test/diagnostic helper — clears the in-memory log. Not exposed to UI. */
export function _resetAuditLog(): void {
  auditStore.setState({ records: [] });
}
