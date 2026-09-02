// FIFAYITI — Production database verification script.
//
// Connects to the production DATABASE_URL (read from the environment)
// and verifies that:
//   1. All expected tables exist
//   2. The betting config is seeded (5 stake pools + 5 market templates)
//   3. A test bettor can be created + persists
//   4. The wallet + ledger entries are created
//
// The connection string is NEVER logged. Only the verification results.
//
// Run: bash scripts/setup-prod-db.sh  (which calls this script)
// Or:  bun scripts/verify-prod-db.ts (with DATABASE_URL set)

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  log: ["error"],
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const EXPECTED_TABLES = [
  "User", "Team", "Player", "Match", "MatchEvent", "Competition", "Group",
  "TeamRegistration", "Replay",
  // Betting models
  "Bettor", "Wallet", "LedgerEntry", "StakePool", "MarketTemplate",
  "BettingMarket", "MarketSelection", "BetOrder", "OfficialEvent",
  "BettingAuditLog",
  // Financial safety models
  "PaymentIntent", "SettlementTransaction", "Account", "AccountEntry",
  "OutboxEvent", "RateLimitAudit",
];

const EXPECTED_STAKE_POOLS = [
  { label: "50 HTG", amount: "5000" },
  { label: "100 HTG", amount: "10000" },
  { label: "250 HTG", amount: "25000" },
  { label: "500 HTG", amount: "50000" },
  { label: "1,000 HTG", amount: "100000" },
];

const EXPECTED_TEMPLATES = [
  "NEXT_GOAL", "ANOTHER_GOAL", "NEXT_YELLOW_CARD", "TOTAL_GOALS_OVER", "MATCH_WINNER",
];

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  const mark = ok ? "✅" : "❌";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
}

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    console.error("❌ DATABASE_URL must be a postgres URL for verification.");
    process.exit(1);
  }

  console.log("🔍 Verifying production database setup...\n");

  // ── 1. Tables exist ──
  console.log("── Tables ──");
  for (const table of EXPECTED_TABLES) {
    try {
      // Try a count query — if the table doesn't exist, Prisma throws.
      await (db as any)[table.charAt(0).toLowerCase() + table.slice(1)].count();
      check(`Table: ${table}`, true);
    } catch (e: any) {
      check(`Table: ${table}`, false, e?.message?.split("\n")[0]);
    }
  }
  console.log();

  // ── 2. Stake pools ──
  console.log("── Stake Pools ──");
  const pools = await db.stakePool.findMany({ orderBy: { displayOrder: "asc" } });
  check(`Stake pool count = 5`, pools.length === 5, `found ${pools.length}`);
  for (const expected of EXPECTED_STAKE_POOLS) {
    const found = pools.find((p) => p.amountCentimes.toString() === expected.amount);
    check(`Stake pool ${expected.label}`, !!found);
  }
  console.log();

  // ── 3. Market templates ──
  console.log("── Market Templates ──");
  const templates = await db.marketTemplate.findMany();
  check(`Template count = 5`, templates.length === 5, `found ${templates.length}`);
  for (const code of EXPECTED_TEMPLATES) {
    const found = templates.find((t) => t.code === code);
    check(`Template ${code}`, !!found);
  }
  console.log();

  // ── 4. Bettor registration + wallet + ledger ──
  console.log("── Bettor registration + wallet + ledger ──");
  const testEmail = `verify-${Date.now()}@fifayiti.test`;
  try {
    // Create a bettor.
    const bettor = await db.bettor.create({
      data: {
        email: testEmail,
        passwordHash: "$2b$10$test:verificationscript",
        status: "ACTIVE",
      },
    });
    check("Bettor created", !!bettor);

    // Create a wallet.
    const wallet = await db.wallet.create({
      data: { bettorId: bettor.id },
    });
    check("Wallet created", !!wallet);
    check("Wallet available = 0", wallet.availableCentimes === 0n);
    check("Wallet reserved = 0", wallet.reservedCentimes === 0n);

    // Create a ledger entry (deposit).
    const before = await db.wallet.findUnique({ where: { bettorId: bettor.id } });
    if (before) {
      await db.wallet.update({
        where: { bettorId: bettor.id },
        data: { availableCentimes: before.availableCentimes + 50000n },
      });
      await db.ledgerEntry.create({
        data: {
          bettorId: bettor.id,
          amountCentimes: 50000n,
          type: "DEPOSIT",
          referenceType: "verification",
          balanceAfterCentimes: 50000n,
        },
      });
    }
    const after = await db.wallet.findUnique({ where: { bettorId: bettor.id } });
    check("Ledger entry created + wallet updated", after?.availableCentimes === 50000n);

    // Verify the ledger entry.
    const ledger = await db.ledgerEntry.findMany({ where: { bettorId: bettor.id } });
    check("Ledger has 1 entry", ledger.length === 1);
    check("Ledger entry type = DEPOSIT", ledger[0]?.type === "DEPOSIT");

    // Verify persistence: re-read the bettor.
    const reRead = await db.bettor.findUnique({ where: { id: bettor.id } });
    check("Bettor persists", reRead?.email === testEmail);

    // Clean up the test bettor.
    await db.ledgerEntry.deleteMany({ where: { bettorId: bettor.id } });
    await db.wallet.deleteMany({ where: { bettorId: bettor.id } });
    await db.bettor.delete({ where: { id: bettor.id } });
    check("Test bettor cleaned up", true);
  } catch (e: any) {
    check("Bettor registration + wallet + ledger", false, e?.message?.split("\n")[0]);
  }

  console.log();
  console.log(`── Summary ──`);
  console.log(`   ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error(`\n❌ ${fail} verification(s) failed.`);
    process.exit(1);
  }
  console.log(`\n✅ All verifications passed.`);
}

main()
  .catch((e) => { console.error("Verification failed:", e?.message); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
