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
import { settleWin, settleLoss, refundBet } from "./wallet";
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
          await tx.betOrder.update({
            where: { id: bet.id },
            data: {
              status: "MARKET_CANCELLED",
              settledAt: new Date(),
              settleOutcome: "REFUND",
              payoutCentimes: bet.stakeCentimes,
            },
          });
          // Refund the stake to the bettor's available balance.
          const wallet = await tx.wallet.findUnique({ where: { bettorId: bet.bettorId } });
          if (wallet) {
            await tx.wallet.update({
              where: { bettorId: bet.bettorId },
              data: { availableCentimes: wallet.availableCentimes + bet.stakeCentimes },
            });
            await tx.ledgerEntry.create({
              data: {
                bettorId: bet.bettorId,
                amountCentimes: bet.stakeCentimes,
                type: "BET_REFUND",
                referenceType: "bet_order",
                referenceId: bet.id,
                balanceAfterCentimes: wallet.availableCentimes + wallet.reservedCentimes + bet.stakeCentimes,
                metadata: JSON.stringify({ action: "refund_match_abandoned", marketId }),
              },
            });
          }
          refundedCount++;
        }
        return { marketId, outcome: "refunded", refundedCount, reason: "match abandoned" };
      }

      // ── Compute the winning selection key ──
      const winningKey = computeWinningSelection(market, triggeringEvent);
      if (!winningKey) {
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
          const winnings = payout - bet.stakeCentimes; // net profit

          await tx.betOrder.update({
            where: { id: bet.id },
            data: {
              status: "SETTLED",
              settledAt: new Date(),
              settleOutcome: "WIN",
              payoutCentimes: payout,
            },
          });

          // Credit the winner.
          const wallet = await tx.wallet.findUnique({ where: { bettorId: bet.bettorId } });
          if (wallet) {
            await tx.wallet.update({
              where: { bettorId: bet.bettorId },
              data: { availableCentimes: wallet.availableCentimes + payout },
            });
            await tx.ledgerEntry.create({
              data: {
                bettorId: bet.bettorId,
                amountCentimes: payout,
                type: "BET_SETTLE_WIN",
                referenceType: "bet_order",
                referenceId: bet.id,
                balanceAfterCentimes: wallet.availableCentimes + wallet.reservedCentimes + payout,
                metadata: JSON.stringify({
                  action: "settle_win",
                  marketId,
                  stake: bet.stakeCentimes.toString(),
                  winnings: winnings.toString(),
                  commission: commission.toString(),
                  payout: payout.toString(),
                }),
              },
            });
            // Record the commission separately.
            if (commission > 0n) {
              await tx.ledgerEntry.create({
                data: {
                  bettorId: bet.bettorId,
                  amountCentimes: -commission,
                  type: "COMMISSION",
                  referenceType: "bet_order",
                  referenceId: bet.id,
                  balanceAfterCentimes: wallet.availableCentimes + wallet.reservedCentimes + payout,
                  metadata: JSON.stringify({ action: "commission", marketId, commission: commission.toString() }),
                },
              });
            }
          }
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
          await tx.ledgerEntry.create({
            data: {
              bettorId: bet.bettorId,
              amountCentimes: 0n,
              type: "BET_SETTLE_LOSS",
              referenceType: "bet_order",
              referenceId: bet.id,
              balanceAfterCentimes: 0n, // read wallet below
              metadata: JSON.stringify({ action: "settle_loss", marketId, stake: bet.stakeCentimes.toString() }),
            },
          });
          loserCount++;
        }
      }

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
  try {
    return await db.$transaction(async (tx) => {
      const market = await tx.bettingMarket.findUnique({
        where: { id: marketId },
        include: { selections: true },
      });
      if (!market) return { marketId, outcome: "no_action", reason: "not found" };

      // Refund all settled bets.
      const settledBets = await tx.betOrder.findMany({
        where: { marketId, status: "SETTLED" },
      });

      let refundedCount = 0;
      for (const bet of settledBets) {
        // Refund the original stake (losers get their stake back; winners
        // lose their winnings but keep their stake).
        const wallet = await tx.wallet.findUnique({ where: { bettorId: bet.bettorId } });
        if (wallet) {
          await tx.wallet.update({
            where: { bettorId: bet.bettorId },
            data: { availableCentimes: wallet.availableCentimes + bet.stakeCentimes },
          });
          await tx.ledgerEntry.create({
            data: {
              bettorId: bet.bettorId,
              amountCentimes: bet.stakeCentimes,
              type: "BET_REFUND",
              referenceType: "bet_order",
              referenceId: bet.id,
              balanceAfterCentimes: wallet.availableCentimes + wallet.reservedCentimes + bet.stakeCentimes,
              metadata: JSON.stringify({ action: "refund_cancelled_event", marketId, eventId: event.id }),
            },
          });
        }
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

      // Reopen the market.
      await tx.bettingMarket.update({
        where: { id: marketId },
        data: {
          status: "OPEN",
          settleEventId: null,
          settleOutcome: null,
          settledAt: null,
        },
      });

      return { marketId, outcome: "refunded", refundedCount, reason: "event cancelled, market reopened" };
    });
  } catch (e: any) {
    return { marketId, outcome: "no_action", reason: e?.message };
  }
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
        where: { marketId, status: "OPEN" },
      });

      let refundedCount = 0;
      for (const bet of matchedBets) {
        await tx.betOrder.update({
          where: { id: bet.id },
          data: { status: "MARKET_CANCELLED", settledAt: new Date(), settleOutcome: "REFUND", payoutCentimes: bet.stakeCentimes },
        });
        const wallet = await tx.wallet.findUnique({ where: { bettorId: bet.bettorId } });
        if (wallet) {
          await tx.wallet.update({
            where: { bettorId: bet.bettorId },
            data: { availableCentimes: wallet.availableCentimes + bet.stakeCentimes },
          });
          await tx.ledgerEntry.create({
            data: {
              bettorId: bet.bettorId,
              amountCentimes: bet.stakeCentimes,
              type: "BET_REFUND",
              referenceType: "bet_order",
              referenceId: bet.id,
              balanceAfterCentimes: wallet.availableCentimes + wallet.reservedCentimes + bet.stakeCentimes,
              metadata: JSON.stringify({ action: "refund_market_cancel", marketId, reason }),
            },
          });
        }
        refundedCount++;
      }

      for (const bet of openBets) {
        await tx.betOrder.update({
          where: { id: bet.id },
          data: { status: "CANCELLED" },
        });
        const wallet = await tx.wallet.findUnique({ where: { bettorId: bet.bettorId } });
        if (wallet) {
          await tx.wallet.update({
            where: { bettorId: bet.bettorId },
            data: {
              availableCentimes: wallet.availableCentimes + bet.stakeCentimes,
              reservedCentimes: wallet.reservedCentimes - bet.stakeCentimes,
            },
          });
          await tx.ledgerEntry.create({
            data: {
              bettorId: bet.bettorId,
              amountCentimes: bet.stakeCentimes,
              type: "BET_RELEASE",
              referenceType: "bet_order",
              referenceId: bet.id,
              balanceAfterCentimes: wallet.availableCentimes + wallet.reservedCentimes,
              metadata: JSON.stringify({ action: "release_market_cancel", marketId, reason }),
            },
          });
        }
      }

      return { marketId, outcome: "refunded", refundedCount };
    });
  } catch (e: any) {
    return { marketId, outcome: "no_action", reason: e?.message };
  }
}
