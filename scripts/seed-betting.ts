// FIFAYITI PARIAJ — Seed the betting configuration (stake pools + templates).
// Run once after migration. Idempotent (skips existing rows).

import { db } from "../src/lib/db";
import { DEFAULT_STAKE_POOLS, MARKET_TEMPLATES } from "../src/lib/betting/types";

async function main() {
  console.log("🌱 Seeding betting configuration...");

  // ── Stake pools ──
  for (const pool of DEFAULT_STAKE_POOLS) {
    const existing = await db.stakePool.findUnique({
      where: { amountCentimes: pool.amountCentimes },
    });
    if (existing) {
      console.log(`  ⏭  StakePool ${pool.label} (already exists)`);
      continue;
    }
    await db.stakePool.create({
      data: {
        amountCentimes: pool.amountCentimes,
        label: pool.label,
        enabled: true,
        displayOrder: pool.displayOrder,
      },
    });
    console.log(`  ✅ StakePool ${pool.label}`);
  }

  // ── Market templates ──
  for (const tpl of MARKET_TEMPLATES) {
    const existing = await db.marketTemplate.findUnique({
      where: { code: tpl.code },
    });
    if (existing) {
      console.log(`  ⏭  MarketTemplate ${tpl.code} (already exists)`);
      continue;
    }
    await db.marketTemplate.create({
      data: {
        code: tpl.code,
        label: tpl.label,
        selectionMode: tpl.selectionMode,
        settleOnEvent: tpl.settleOnEvent,
        settleRule: tpl.settleRule,
        enabled: true,
      },
    });
    console.log(`  ✅ MarketTemplate ${tpl.code}`);
  }

  console.log("✅ Betting config seeded.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
