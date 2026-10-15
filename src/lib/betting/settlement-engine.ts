// FIFAYITI PARIAJ — Settlement engine (event-driven, deterministic).
//
// The settlement engine reads OfficialEvents (confirmed/cancelled) and
// determines the winning side of each affected market. It NEVER relies on
// manual operator declarations — outcomes are computed from:
//   - the market template's settleRule
//   - the official event type + metadata
//   - the match state at the time of the event
//
// SETTLEMENT FLOW:
//   1. OfficialEvent arrives (confirmed or cancelled)
//   2. Find all OPEN or MATCHED markets whose settleOnEvent matches
//   3. For each market, compute the winning selection via the template rule
//   4. If a winner is determined:
//      - Suspend the market (no new bets)
//      - Settle all matched bets: winners get stake + winnings - commission
//      - Losers forfeit their stake
//   5. If the event was CANCELLED (correction):
//      - Refund all matched bets for markets that depended on that event
//      - Reopen the market if appropriate (or cancel it)

import { db } from "@/lib/db";
import { settleWin, settleLoss, refundBet, releaseFromBet } from "./wallet";
import { computeCommission } from "./types";

export interface SettlementResult {
  marketId: string;
  outcome: "settled" | "refunded" | "no_action";
  winningSelectionKey?: string;
  winnerCount?: number;
  loserCount?: number;
  refundedCount?: number;
  reason?: string;
}

/**
 * Process a confirmed official event. Finds affected markets, settles them.
 */
export async function onOfficialEventConfirmed(eventId: string): Promise<SettlementResult[]> {
  const event = await db.officialEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "CONFIRMED") return [];

  // Find markets for this match whose settleOnEvent matches the event type.
  // A market is settleable if it's OPEN, SUSPENDED, or CLOSED (just closed).
  const markets = await db.bettingMarket.findMany({
    where: {
      matchId: event.matchId,
      status: { in: ["OPEN", "SUSPENDED", "CLOSED"] },
    },
    include: {
      template: true,
      selections: true,
      match: { include: { homeTeam: true, awayTeam: true } },
    },
  });

  const results: SettlementResult[] = [];
  for (const market of markets) {
    // Only settle markets whose template triggers on this event type.
    // For GOL, NEXT_GOAL settles. For FEN_MATCH, ANOTHER_GOAL + MATCH_WINNER settle.
    if (!shouldEventSettleMarket(event.eventType, market.template.settleOnEvent, market.template.code)) {
      continue;
    }

    const result = await settleMarket(market.id, event);
    results.push(result);
  }
  return results;
}

/**
 * Determine if an event type should settle a market template.
 */
function shouldEventSettleMarket(eventType: string, settleOnEvent: string, templateCode: string): boolean {
  // GOL settles NEXT_GOAL (and contributes to ANOTHER_GOAL, TOTAL_GOALS_OVER,
  // MATCH_WINNER — but those settle on FEN_MATCH).
  if (eventType === "GOL" && settleOnEvent === "GOL") return true;
  if (eventType === "KAT_JON" && settleOnEvent === "KAT_JON") return true;
  // FEN_MATCH settles ANOTHER_GOAL, TOTAL_GOALS_OVER, MATCH_WINNER.
  if (eventType === "FEN_MATCH" && settleOnEvent === "FEN_MATCH") return true;
  // MATCH_ABANDONED → refund all active markets.
  if (eventType === "MATCH_ABANDONED") return true;
  return false;
}

/**
 * Settle a single market: compute the winner, settle all matched bets.
 *
 * IDEMPOTENCY (spec P0.6):
 *   The FIRST thing this does inside the transaction is attempt to create a
 *   SettlementTransaction row with @@unique([marketId, settleEventId]).
 *   If a duplicate settlement attempt runs (retry, server restart, concurrent
 *   trigger), the unique constraint throws and we return "already settled"
 *   WITHOUT creating any financial effect. A bettor can never receive
 *   winnings twice.
 */
async function settleMarket(marketId: string, triggeringEvent: any): Promise<SettlementResult> {
  try {
    return await db.$transaction(async (tx) => {
      const market = await tx.bettingMarket.findUnique({
        where: { id: marketId },
        include: {
          template: true,
          selections: true,
          match: { include: { homeTeam: true, awayTeam: true } },
        },
      });
      if (!market) return { marketId, outcome: "no_action", reason: "market not found" };
      if (market.status === "SETTLED" || market.status === "CANCELLED") {
        return { marketId, outcome: "no_action", reason: `already ${market.status}` };
      }
      const lockedMarket = await tx.bettingMarket.updateMany({
        where: { id: marketId, status: market.status },
        data: { status: market.status },
      });
      if (lockedMarket.count !== 1) {
        return { marketId, outcome: "no_action", reason: "market changed concurrently" };
      }

      // ── IDEMPOTENCY GUARD ────────────────────────────────────────────
      // Try to insert a SettlementTransaction row. If it exists already
      // (unique on marketId + settleEventId), this settlement is a retry
      // — return no_action without touching any wallet.
      try {
        await tx.settlementTransaction.create({
          data: {
            marketId,
            settleEventId: triggeringEvent.id,
            outcome: "settling",
          },
        });
      } catch (e: any) {
        // Unique constraint violation → duplicate settlement attempt.
        if (String(e?.message ?? "").includes("Unique") || String(e?.code ?? "").includes("P2002")) {
          return {
            marketId,
            outcome: "no_action",
            reason: "already settled for this event (idempotent)",
          };
        }
        throw e;
      }

      // ── Match abandoned → refund all matched bets ──
      if (triggeringEvent.eventType === "MATCH_ABANDONED") {
        await tx.bettingMarket.update({
          where: { id: marketId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            settleEventId: triggeringEvent.id,
            settleOutcome: JSON.stringify({ reason: "match_abandoned", refund: true }),
          },
        });

        const matchedBets = await tx.betOrder.findMany({
          where: { marketId, status: "MATCHED" },
        });

        let refundedCount = 0;
        for (const bet of matchedBets) {
          await refundBet(bet.bettorId, bet.stakeCentimes, bet.id, marketId, tx);
          await tx.betOrder.update({
            where: { id: bet.id },
            data: {
              status: "MARKET_CANCELLED",
              settledAt: new Date(),
              settleOutcome: "REFUND",
              payoutCentimes: bet.stakeCentimes,
            },
          });
          refundedCount++;
        }
        await releaseOpenBets(tx, marketId);
        await tx.settlementTransaction.updateMany({
          where: { marketId, settleEventId: triggeringEvent.id },
          data: { outcome: "refunded", refundedCount },
        });
        return { marketId, outcome: "refunded", refundedCount, reason: "match abandoned" };
      }

      // ── Compute the winning selection key ──
      const winningKey = computeWinningSelection(market, triggeringEvent);
      if (!winningKey) {
        // A draw in a match-winner market has no winning side. Return every
        // matched stake through the canonical ledger rather than leaving the
        // settlement permanently stuck behind its idempotency row.
        if (market.template.code === "MATCH_WINNER" && triggeringEvent.eventType === "FEN_MATCH") {
          const drawBets = await tx.betOrder.findMany({ where: { marketId, status: "MATCHED" } });
          for (const bet of drawBets) {
            await refundBet(bet.bettorId, bet.stakeCentimes, bet.id, marketId, tx);
            await tx.betOrder.update({
              where: { id: bet.id },
              data: { status: "MARKET_CANCELLED", settledAt: new Date(), settleOutcome: "REFUND", payoutCentimes: bet.stakeCentimes },
            });
          }
          await releaseOpenBets(tx, marketId);
          await tx.bettingMarket.update({
            where: { id: marketId },
            data: { status: "SETTLED", settleEventId: triggeringEvent.id, settleOutcome: "REFUND", settledAt: new Date() },
          });
          await tx.settlementTransaction.updateMany({
            where: { marketId, settleEventId: triggeringEvent.id },
            data: { outcome: "refunded", refundedCount: drawBets.length },
          });
          return { marketId, outcome: "refunded", refundedCount: drawBets.length, reason: "match winner was a draw" };
        }
        // Do not commit an idempotency row for an event that cannot resolve
        // this market; a later corrected event must remain processable.
        await tx.settlementTransaction.deleteMany({ where: { marketId, settleEventId: triggeringEvent.id } });
        return { marketId, outcome: "no_action", reason: "no winner determined" };
      }

      // ── Suspend + settle the market ──
      await tx.bettingMarket.update({
        where: { id: marketId },
        data: {
          status: "SETTLING",
          settleEventId: triggeringEvent.id,
          settleOutcome: JSON.stringify({
            winningSelection: winningKey,
            reason: `event: ${triggeringEvent.eventType}`,
          }),
        },
      });

      // ── Settle all matched bets ──
      const matchedBets = await tx.betOrder.findMany({
        where: { marketId, status: "MATCHED" },
        include: { selection: true },
      });

      let winnerCount = 0;
      let loserCount = 0;
      for (const bet of matchedBets) {
        const isWinner = bet.selection.key === winningKey;

        if (isWinner) {
          // Winner gets their stake back + the opposing stake minus commission.
          const pot = bet.stakeCentimes * 2n; // both stakes
          const commission = computeCommission(pot);
          const payout = pot - commission;
          await tx.betOrder.update({
            where: { id: bet.id },
            data: {
              status: "SETTLED",
              settledAt: new Date(),
              settleOutcome: "WIN",
              payoutCentimes: payout,
            },
          });

          // The opposing stake is gross winnings; settleWin posts the net
          // payout and platform commission as balanced ledger entries.
          await settleWin(bet.bettorId, bet.stakeCentimes, bet.stakeCentimes, commission, bet.id, marketId, tx);
          winnerCount++;
        } else {
          // Loser forfeits (funds already removed from wallet at match time).
          await tx.betOrder.update({
            where: { id: bet.id },
            data: {
              status: "SETTLED",
              settledAt: new Date(),
              settleOutcome: "LOSS",
              payoutCentimes: 0n,
            },
          });
          await settleLoss(bet.bettorId, bet.stakeCentimes, bet.id, marketId, tx);
          loserCount++;
        }
      }

      // Once the market resolves, unmatched orders are no longer executable.
      // Release their reserved funds in this same transaction.
      await releaseOpenBets(tx, marketId);

      // ── Finalize the market + the SettlementTransaction record ──
      await tx.bettingMarket.update({
        where: { id: marketId },
        data: { status: "SETTLED", settledAt: new Date() },
      });

      // Update the SettlementTransaction row (created at the start as a
      // placeholder for the idempotency guard) with the real outcome.
      await tx.settlementTransaction.updateMany({
        where: { marketId, settleEventId: triggeringEvent.id },
        data: {
          outcome: "settled",
          winningSelectionKey: winningKey,
          winnerCount,
          loserCount,
        },
      });

      return {
        marketId,
        outcome: "settled",
        winningSelectionKey: winningKey,
        winnerCount,
        loserCount,
      };
    });
  } catch (e: any) {
    console.error("[settlement] settleMarket failed:", e?.message);
    return { marketId, outcome: "no_action", reason: e?.message };
  }
}

async function releaseOpenBets(tx: any, marketId: string) {
  const openBets = await tx.betOrder.findMany({
    where: { marketId, status: { in: ["OPEN", "RESERVED"] } },
  });
  for (const bet of openBets) {
    const claimed = await tx.betOrder.updateMany({
      where: { id: bet.id, status: bet.status },
      data: { status: "CANCELLED" },
    });
    if (claimed.count === 1) {
      await releaseFromBet(bet.bettorId, bet.stakeCentimes, bet.id, tx);
    }
  }
}

/**
 * Compute the winning selection key for a market given the triggering event.
 *
 * This is the deterministic settlement rule per template:
 *   NEXT_GOAL       → the scoring team's selection key
 *   ANOTHER_GOAL    → YES if total goals increased since market open, else NO
 *   NEXT_YELLOW_CARD→ the carded team's selection key
 *   TOTAL_GOALS_OVER→ OVER if total > threshold, else UNDER
 *   MATCH_WINNER    → HOME if home wins, AWAY if away wins, REFUND if draw
 */
function computeWinningSelection(market: any, event: any): string | null {
  const templateCode = market.template.code;
  const match = market.match;

  switch (templateCode) {
    case "NEXT_GOAL": {
      // The event must be a GOL. The scoring team is the winner.
      if (event.eventType !== "GOL" || !event.teamId) return null;
      // Find the selection whose key maps to this team.
      // Selection keys are "HOME" or "AWAY"; the event's teamId is the
      // home or away team's id.
      if (event.teamId === match.homeTeamId) return "HOME";
      if (event.teamId === match.awayTeamId) return "AWAY";
      return null;
    }

    case "NEXT_YELLOW_CARD": {
      if (event.eventType !== "KAT_JON" || !event.teamId) return null;
      if (event.teamId === match.homeTeamId) return "HOME";
      if (event.teamId === match.awayTeamId) return "AWAY";
      return null;
    }

    case "ANOTHER_GOAL": {
      // Settles on FEN_MATCH. YES wins if total goals > goals at market open.
      // The market config stores goalsAtMarketOpen.
      const config = JSON.parse(market.config || "{}");
      const goalsAtOpen = config.goalsAtMarketOpen ?? 0;
      const totalGoals = (match.homeScore ?? 0) + (match.awayScore ?? 0);
      return totalGoals > goalsAtOpen ? "YES" : "NO";
    }

    case "TOTAL_GOALS_OVER": {
      const config = JSON.parse(market.config || "{}");
      const threshold = config.threshold ?? 0;
      const totalGoals = (match.homeScore ?? 0) + (match.awayScore ?? 0);
      return totalGoals > threshold ? "OVER" : "UNDER";
    }

    case "MATCH_WINNER": {
      // Settles on FEN_MATCH. Draw → refund (handled by caller as no winner).
      if ((match.homeScore ?? 0) > (match.awayScore ?? 0)) return "HOME";
      if ((match.awayScore ?? 0) > (match.homeScore ?? 0)) return "AWAY";
      return null; // draw → refund
    }

    default:
      return null;
  }
}

/**
 * Handle a cancelled official event. Refunds all markets that depended
 * on that event. Reopens the market if appropriate.
 */
export async function onOfficialEventCancelled(eventId: string): Promise<SettlementResult[]> {
  const event = await db.officialEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "CANCELLED") return [];

  const markets = await db.bettingMarket.findMany({
    where: {
      matchId: event.matchId,
      status: { in: ["OPEN", "SUSPENDED", "SETTLING", "SETTLED"] },
    },
    include: { template: true, selections: true },
  });

  const results: SettlementResult[] = [];
  for (const market of markets) {
    if (!shouldEventSettleMarket(event.eventType, market.template.settleOnEvent, market.template.code)) {
      continue;
    }

    // If the market was already SETTLED by this event, refund + reopen.
    if (market.status === "SETTLED" && market.settleEventId === event.id) {
      results.push(await refundAndReopenMarket(market.id, event));
    } else if (market.status === "OPEN" || market.status === "SUSPENDED") {
      // Market not yet settled — if the cancelled event was the trigger,
      // just reopen the market (no refund needed since no settlement happened).
      results.push({ marketId: market.id, outcome: "no_action", reason: "market not yet settled" });
    }
  }
  return results;
}

/**
 * Refund a settled market (event was cancelled) and reopen it.
 */
async function refundAndReopenMarket(marketId: string, event: any): Promise<SettlementResult> {
  // A post-settlement correction requires reversing the original balanced
  // payouts (including already-spent winnings and revenue). Crediting stakes
  // directly would mint funds, so leave the posted ledger intact and require
  // an audited financial reversal workflow before reopening this market.
  const market = await db.bettingMarket.findUnique({ where: { id: marketId } });
  if (!market) return { marketId, outcome: "no_action", reason: "not found" };
  if (market.settleEventId !== event.id || market.status !== "SETTLED") {
    return { marketId, outcome: "no_action", reason: "settled market changed; reconciliation required" };
  }
  await db.bettingAuditLog.create({
    data: {
      actorType: "system",
      action: "settlement.correction.requires_reversal",
      targetType: "market",
      targetId: marketId,
      reason: `Official event ${event.id} was cancelled after settlement; ledger reversal required before reopening.`,
      afterState: JSON.stringify({ eventId: event.id, marketStatus: market.status }),
    },
  });
  return { marketId, outcome: "no_action", reason: "settled event was cancelled; audited financial reversal required" };
}

/**
 * Emergency: suspend ALL open markets (operator "SUSPEND ALL BETTING").
 */
export async function suspendAllMarkets(): Promise<number> {
  const result = await db.bettingMarket.updateMany({
    where: { status: "OPEN" },
    data: { status: "SUSPENDED" },
  });
  return result.count;
}

/**
 * Cancel a market manually (operator "CANCEL MARKET"). Refunds all matched bets.
 */
export async function cancelMarket(marketId: string, reason: string): Promise<SettlementResult> {
  try {
    return await db.$transaction(async (tx) => {
      const market = await tx.bettingMarket.findUnique({ where: { id: marketId } });
      if (!market) return { marketId, outcome: "no_action", reason: "not found" };
      if (market.status === "SETTLED" || market.status === "CANCELLED") {
        return { marketId, outcome: "no_action", reason: `already ${market.status}` };
      }

      const lockedMarket = await tx.bettingMarket.updateMany({
        where: { id: marketId, status: market.status },
        data: { status: market.status },
      });
      if (lockedMarket.count !== 1) return { marketId, outcome: "no_action", reason: "market changed concurrently" };

      await tx.bettingMarket.update({
        where: { id: marketId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          settleOutcome: JSON.stringify({ reason, refund: true }),
        },
      });

      // Refund matched bets + release open bets.
      const matchedBets = await tx.betOrder.findMany({
        where: { marketId, status: "MATCHED" },
      });
      const openBets = await tx.betOrder.findMany({
        where: { marketId, status: { in: ["OPEN", "RESERVED"] } },
      });

      let refundedCount = 0;
      for (const bet of matchedBets) {
        await refundBet(bet.bettorId, bet.stakeCentimes, bet.id, marketId, tx);
        await tx.betOrder.update({
          where: { id: bet.id },
          data: { status: "MARKET_CANCELLED", settledAt: new Date(), settleOutcome: "REFUND", payoutCentimes: bet.stakeCentimes },
        });
        refundedCount++;
      }

      for (const bet of openBets) {
        await releaseFromBet(bet.bettorId, bet.stakeCentimes, bet.id, tx);
        await tx.betOrder.update({
          where: { id: bet.id },
          data: { status: "CANCELLED" },
        });
      }

      return { marketId, outcome: "refunded", refundedCount };
    });
  } catch (e: any) {
    return { marketId, outcome: "no_action", reason: e?.message };
  }
}
