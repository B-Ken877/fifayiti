// POST /api/admin/migrate — one-time schema setup for production PostgreSQL.
//
// This endpoint runs `prisma db push` programmatically against the runtime
// DATABASE_URL, then seeds the betting config (stake pools + market
// templates). Protected by admin auth (president/director only).
//
// This is the SAFE way to set up the production database — it doesn't
// expose the DATABASE_URL to the client, and it uses the Vercel env var
// directly.
//
// USAGE (one-time, after setting DATABASE_URL in Vercel):
//   1. Login as president or director at /login
//   2. curl -X POST https://fifayiti.vercel.app/api/admin/migrate \
//        -H "cookie: fifayiti-session=<your-admin-cookie>"
//
// Or step-by-step:
//   POST /api/admin/migrate?step=push   (schema only)
//   POST /api/admin/migrate?step=seed   (seed data only)

import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { getSessionRole } from "@/lib/auth/session";
import { canManageSystem } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { DEFAULT_STAKE_POOLS, MARKET_TEMPLATES } from "@/lib/betting/types";

export async function POST(req: NextRequest) {
  const role = getSessionRole(req.headers.get("cookie"));
  if (!role) return NextResponse.json({ error: "Ou pa otorize." }, { status: 401 });
  if (!canManageSystem(role)) {
    return NextResponse.json({ error: "Sèlman administratè ka ranne baz done a." }, { status: 403 });
  }

  const step = req.nextUrl.searchParams.get("step") ?? "all";
  const results: string[] = [];

  try {
    if (step === "all" || step === "push") {
      results.push("Running prisma db push...");
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        return NextResponse.json({ error: "DATABASE_URL pa konfigire." }, { status: 500 });
      }
      if (!databaseUrl.startsWith("postgres")) {
        return NextResponse.json({ error: "DATABASE_URL dwe se yon PostgreSQL URL nan pwodiksyon." }, { status: 500 });
      }

      const fs = await import("fs/promises");
      const path = await import("path");
      const tmpSchema = path.join(process.cwd(), "prisma", "schema.postgres.prisma");
      const srcSchema = path.join(process.cwd(), "prisma", "schema.prisma");
      const src = await fs.readFile(srcSchema, "utf-8");
      const pgSchema = src.replace(
        /datasource db \{\s*provider = "[^"]*"/,
        'datasource db {\n  provider = "postgresql"',
      );
      await fs.writeFile(tmpSchema, pgSchema);
      try {
        execSync(`bunx prisma db push --skip-generate --schema ${tmpSchema}`, {
          stdio: "pipe",
          env: { ...process.env, DATABASE_URL: databaseUrl },
          timeout: 120_000,
        });
        results.push("✅ Schema pushed to PostgreSQL.");
      } finally {
        await fs.unlink(tmpSchema).catch(() => {});
      }
    }

    if (step === "all" || step === "seed") {
      results.push("Seeding betting config...");
      let poolsCreated = 0;
      let templatesCreated = 0;
      for (const pool of DEFAULT_STAKE_POOLS) {
        const existing = await db.stakePool.findUnique({
          where: { amountCentimes: pool.amountCentimes },
        }).catch(() => null);
        if (!existing) {
          await db.stakePool.create({
            data: {
              amountCentimes: pool.amountCentimes,
              label: pool.label,
              enabled: true,
              displayOrder: pool.displayOrder,
            },
          }).catch(() => {});
          poolsCreated++;
        }
      }
      for (const tpl of MARKET_TEMPLATES) {
        const existing = await db.marketTemplate.findUnique({
          where: { code: tpl.code },
        }).catch(() => null);
        if (!existing) {
          await db.marketTemplate.create({
            data: {
              code: tpl.code,
              label: tpl.label,
              selectionMode: tpl.selectionMode,
              settleOnEvent: tpl.settleOnEvent,
              settleRule: tpl.settleRule,
              enabled: true,
            },
          }).catch(() => {});
          templatesCreated++;
        }
      }
      results.push(`✅ Seeded ${poolsCreated} stake pools + ${templatesCreated} market templates.`);
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("[admin/migrate] error:", e?.message);
    return NextResponse.json(
      { error: "Migrasyon echwe.", detail: e?.message, results },
      { status: 500 },
    );
  }
}
