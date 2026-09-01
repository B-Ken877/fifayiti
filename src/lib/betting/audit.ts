// FIFAYITI PARIAJ — Audit log helpers.

import { db } from "@/lib/db";

export async function logBettingAction(opts: {
  actorType: string;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  beforeState?: any;
  afterState?: any;
  reason?: string;
  bettorId?: string;
}) {
  try {
    await db.bettingAuditLog.create({
      data: {
        actorType: opts.actorType,
        actorId: opts.actorId ?? null,
        action: opts.action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        beforeState: opts.beforeState ? JSON.stringify(opts.beforeState) : null,
        afterState: opts.afterState ? JSON.stringify(opts.afterState) : null,
        reason: opts.reason ?? null,
        bettorId: opts.bettorId ?? null,
      },
    });
  } catch (e: any) {
    console.warn("[audit] log failed:", e?.message);
  }
}
