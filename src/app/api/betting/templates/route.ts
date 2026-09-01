// GET /api/betting/templates
// Returns the enabled market templates (for the operator UI catalog).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const templates = await db.marketTemplate.findMany({
    where: { enabled: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      code: t.code,
      label: t.label,
      selectionMode: t.selectionMode,
      settleOnEvent: t.settleOnEvent,
      settleRule: t.settleRule,
    })),
  });
}
