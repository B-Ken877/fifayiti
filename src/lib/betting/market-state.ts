// FIFAYITI PARIAJ — Market state + real-time push.
//
// ENFORCES THE ONE-ACTIVE-MARKET RULE (spec §6):
//   For every live match, only ONE market may be in OPEN or SETTLING state
//   at a time. The Betting Operator must close/settle the current market
//   before publishing the next one.
//
// REAL-TIME UPDATES:
//   Market state changes are pushed to the LiveKit broadcast room metadata
//   (same channel as the match score/clock). The bettor UI polls the room
//   metadata every 2s to get the current active market, and receives
//   immediate updates via the LiveKit data channel (bet matched, market
//   suspended, etc.).
//
// ⚠️ Vercel note: same as score/clock — LiveKit metadata is the shared
//   source of truth across lambdas. The DB is for the persistent archive
//   (market history, bet history, ledger).

import { db } from "@/lib/db";
import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import {
  LIVEKIT_API_KEY as API_KEY,
  LIVEKIT_API_SECRET as API_SECRET,
  LIVEKIT_URL,
} from "@/lib/streaming/livekit-config";
import { logBettingAction } from "./audit";

const roomService = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
const ROOM_NAME = "fifayiti-broadcast";

/**
 * Check whether a match already has an active (OPEN/SETTLING) market.
 * Used to enforce the one-active-market rule on the backend.
 */
export async function hasActiveMarket(matchId: string): Promise<boolean> {
  const count = await db.bettingMarket.count({
    where: {
      matchId,
      status: { in: ["OPEN", "SETTLING", "PUBLISHED"] },
    },
  });
  return count > 0;
}

/**
 * Get the active market for a match (the single OPEN/SETTLING market),
 * including selections, template, and liquidity.
 */
export async function getActiveMarket(matchId: string) {
  const market = await db.bettingMarket.findFirst({
    where: {
      matchId,
      status: { in: ["OPEN", "SETTLING", "PUBLISHED", "SUSPENDED"] },
    },
    include: {
      template: true,
      selections: { orderBy: { order: "asc" } },
      match: { include: { homeTeam: true, awayTeam: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return market;
}

/**
 * Push the current active market state to the LiveKit room metadata.
 * The bettor UI reads this to know which market is live.
 *
 * Called after every market state change (publish, suspend, settle, etc.).
 */
export async function pushMarketState(marketId: string) {
  try {
    const market = await db.bettingMarket.findUnique({
      where: { id: marketId },
      include: { template: true, selections: true, match: true },
    });
    if (!market) return;

    // Read the current room metadata.
    const rooms = await roomService.listRooms();
    const room = rooms.find((r: any) => r.name === ROOM_NAME);
    if (!room) return; // no room yet — bettors will get it when they connect

    let metadata: any = {};
    try { metadata = JSON.parse(room.metadata || "{}"); } catch {}

    // Merge the activeMarket into the metadata.
    metadata.activeMarket = {
      marketId: market.id,
      matchId: market.matchId,
      templateCode: market.template.code,
      question: market.question,
      status: market.status,
      config: market.config,
      selections: market.selections.map((s: any) => ({
        id: s.id,
        key: s.key,
        label: s.label,
      })),
      publishedAt: market.publishedAt?.toISOString() ?? null,
      openedAt: market.openedAt?.toISOString() ?? null,
    };

    await roomService.updateRoomMetadata(ROOM_NAME, JSON.stringify(metadata));

    // Also broadcast a data-channel message for immediate UI updates.
    await roomService.sendData(
      ROOM_NAME,
      new TextEncoder().encode(JSON.stringify({
        type: "market-update",
        marketId: market.id,
        status: market.status,
      })),
      DataPacket_Kind.RELIABLE,
    ).catch(() => {});
  } catch (e: any) {
    console.warn("[market-state] push failed:", e?.message);
  }
}

/**
 * Clear the active market from the LiveKit metadata (after settlement/cancel).
 */
export async function clearActiveMarket() {
  try {
    const rooms = await roomService.listRooms();
    const room = rooms.find((r: any) => r.name === ROOM_NAME);
    if (!room) return;

    let metadata: any = {};
    try { metadata = JSON.parse(room.metadata || "{}"); } catch {}
    delete metadata.activeMarket;

    await roomService.updateRoomMetadata(ROOM_NAME, JSON.stringify(metadata));
  } catch {}
}

/**
 * Broadcast a bet match event to all bettors via the LiveKit data channel.
 */
export async function broadcastBetMatch(bettorId: string, betOrderId: string, marketId: string) {
  try {
    await roomService.sendData(
      ROOM_NAME,
      new TextEncoder().encode(JSON.stringify({
        type: "bet-matched",
        bettorId,
        betOrderId,
        marketId,
      })),
      DataPacket_Kind.RELIABLE,
    );
  } catch {}
}

/**
 * Broadcast a settlement event to all bettors.
 */
export async function broadcastSettlement(marketId: string, winningKey: string | null) {
  try {
    await roomService.sendData(
      ROOM_NAME,
      new TextEncoder().encode(JSON.stringify({
        type: "market-settled",
        marketId,
        winningSelectionKey: winningKey,
      })),
      DataPacket_Kind.RELIABLE,
    );
  } catch {}
}

/**
 * Transition a market to a new status, enforcing the state machine.
 * Returns the updated market or throws on invalid transition.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["OPEN"],
  OPEN: ["SUSPENDED", "CLOSED", "CANCELLED"],
  SUSPENDED: ["OPEN", "CLOSED", "CANCELLED"],
  CLOSED: ["SETTLING", "CANCELLED"],
  SETTLING: ["SETTLED"],
};

export async function transitionMarketStatus(
  marketId: string,
  newStatus: string,
  operatorId?: string,
  reason?: string,
) {
  return db.$transaction(async (tx) => {
    const market = await tx.bettingMarket.findUnique({ where: { id: marketId } });
    if (!market) throw new Error("market not found");

    const allowed = VALID_TRANSITIONS[market.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`ki pa valab: ${market.status} → ${newStatus}`);
    }

    const now = new Date();
    const updates: any = { status: newStatus };
    if (newStatus === "PUBLISHED") updates.publishedAt = now;
    if (newStatus === "OPEN") updates.openedAt = now;
    if (newStatus === "CLOSED") updates.closedAt = now;
    if (newStatus === "SETTLED") updates.settledAt = now;
    if (newStatus === "CANCELLED") updates.cancelledAt = now;

    const beforeState = { status: market.status };
    const updated = await tx.bettingMarket.update({ where: { id: marketId }, data: updates });
    const afterState = { status: updated.status };

    // Audit log.
    await tx.bettingAuditLog.create({
      data: {
        actorType: "betting_operator",
        actorId: operatorId ?? null,
        action: `market.${newStatus.toLowerCase()}`,
        targetType: "market",
        targetId: marketId,
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason: reason ?? null,
      },
    });

    return updated;
  });
}
