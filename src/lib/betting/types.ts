// FIFAYITI PARIAJ — shared betting types.
//
// All money is in INTEGER minor units (centimes). 1 HTG = 100 centimes.
// NEVER use floating-point or JS `number` for money — use BigInt.

/** 1 HTG = 100 centimes. Convert for display only. */
export const HTG_TO_CENTIMES = 100;

/** Format centimes → "250 HTG" for display. */
export function formatHtg(centimes: bigint | number | null | undefined): string {
  if (centimes == null) return "0 HTG";
  const n = typeof centimes === "bigint" ? Number(centimes) : centimes;
  const htg = Math.floor(n / HTG_TO_CENTIMES);
  return `${htg.toLocaleString("en-US")} HTG`;
}

/** Format centimes → "250.50 HTG" with decimals (for ledger display). */
export function formatHtgPrecise(centimes: bigint | number | null | undefined): string {
  if (centimes == null) return "0.00 HTG";
  const n = typeof centimes === "bigint" ? Number(centimes) : centimes;
  const htg = n / HTG_TO_CENTIMES;
  return `${htg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HTG`;
}

// ── Market templates (predefined catalog) ──────────────────────────────
export const MARKET_TEMPLATES = [
  {
    code: "NEXT_GOAL",
    label: "Kiyès ki pral make pwochen gòl la?",
    selectionMode: "TWO_TEAM" as const,
    settleOnEvent: "GOL",
    settleRule: JSON.stringify({ winningSelection: "scoringTeam" }),
  },
  {
    code: "ANOTHER_GOAL",
    label: "Èske gen yon lòt gòl nan match la?",
    selectionMode: "YES_NO" as const,
    settleOnEvent: "FEN_MATCH",
    settleRule: JSON.stringify({
      yesWinsIf: "totalGoals > goalsAtMarketOpen",
      noWinsIf: "totalGoals == goalsAtMarketOpen",
    }),
  },
  {
    code: "NEXT_YELLOW_CARD",
    label: "Kiyès ekip ki pral jwenn pwochen kat jòn la?",
    selectionMode: "TWO_TEAM" as const,
    settleOnEvent: "KAT_JON",
    settleRule: JSON.stringify({ winningSelection: "cardTeam" }),
  },
  {
    code: "TOTAL_GOALS_OVER",
    label: "Èske total gòl yo ap depase X?",
    selectionMode: "OVER_UNDER" as const,
    settleOnEvent: "FEN_MATCH",
    settleRule: JSON.stringify({
      overWinsIf: "totalGoals > threshold",
      underWinsIf: "totalGoals <= threshold",
    }),
  },
  {
    code: "MATCH_WINNER",
    label: "Kiyès ekip ki pral genyen match la?",
    selectionMode: "TWO_TEAM" as const,
    settleOnEvent: "FEN_MATCH",
    settleRule: JSON.stringify({
      homeWinsIf: "homeScore > awayScore",
      awayWinsIf: "awayScore > homeScore",
      refundIf: "homeScore == awayScore",
    }),
  },
] as const;

export type MarketTemplateCode = (typeof MARKET_TEMPLATES)[number]["code"];

// ── Default stake pools (centimes) ────────────────────────────────────
// 50, 100, 250, 500, 1000 HTG. These are seeded into the StakePool table
// and can be enabled/disabled by an admin without code changes.
export const DEFAULT_STAKE_POOLS = [
  { amountCentimes: 5000n, label: "50 HTG", displayOrder: 0 },
  { amountCentimes: 10000n, label: "100 HTG", displayOrder: 1 },
  { amountCentimes: 25000n, label: "250 HTG", displayOrder: 2 },
  { amountCentimes: 50000n, label: "500 HTG", displayOrder: 3 },
  { amountCentimes: 100000n, label: "1,000 HTG", displayOrder: 4 },
];

// ── Commission (FIFAYITI's fee on winnings) ───────────────────────────
// 5% of the winning side's profit. The winner gets their stake back +
// 95% of the opposing side's stake. FIFAYITI keeps 5%.
export const COMMISSION_BPS = 500; // 5% in basis points

/** Compute the commission on a matched pot (centimes). */
export function computeCommission(potCentimes: bigint): bigint {
  return (potCentimes * BigInt(COMMISSION_BPS)) / 10000n;
}
