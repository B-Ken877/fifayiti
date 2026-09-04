// POST /api/support/webhooks/demo
// Demo webhook for team support donations (dev only — same pattern as
// the bettor-deposit webhook). Verifies the payment + credits the team fund.

import { NextRequest, NextResponse } from "next/server";
import { confirmDonation } from "@/lib/support/donation-service";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Demo webhook not available in production." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { intentId } = body;
    if (!intentId) return NextResponse.json({ error: "intentId required" }, { status: 400 });

    const result = await confirmDonation(intentId, `demo-${Date.now()}`);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
