// POST /api/teams/[id]/support/initiate — initiate a team support donation.
//
// Creates a PaymentIntent (pending) + a TeamDonation record. NO money is
// credited until the provider's webhook verifies. Uses the same payment
// provider abstraction as bettor deposits.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initiateDonation } from "@/lib/support/donation-service";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { providerStatus } from "@/lib/payment";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024) {
    return NextResponse.json({ error: "Done demann lan twò gwo." }, { status: 413 });
  }
  const team = await db.team.findUnique({ where: { id }, select: { id: true } });
  if (!team) return NextResponse.json({ error: "Ekip sa a pa egziste." }, { status: 404 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Done demann lan pa valab." }, { status: 400 });
  }
  const { amountCentimes, provider, donorName, anonymous, message } = body;

  if (typeof amountCentimes !== "string" || !/^\d{1,12}$/.test(amountCentimes) || BigInt(amountCentimes) <= 0n) {
    return NextResponse.json({ error: "Montan pa valid." }, { status: 400 });
  }
  const providerName = provider ?? "demo";
  if (!["moncash", "natcash", "demo"].includes(providerName)) {
    return NextResponse.json({ error: "Pwovèdè peyman sa a pa sipòte." }, { status: 400 });
  }
  const availableProviders = providerStatus();
  if (!availableProviders[providerName as keyof typeof availableProviders]) {
    return NextResponse.json({ error: "Pwovèdè peyman sa a pa disponib kounye a." }, { status: 503 });
  }
  if (donorName != null && (typeof donorName !== "string" || donorName.length > 80)) {
    return NextResponse.json({ error: "Non an dwe gen 80 karaktè oswa mwens." }, { status: 400 });
  }
  if (message != null && (typeof message !== "string" || message.length > 500)) {
    return NextResponse.json({ error: "Mesaj la dwe gen 500 karaktè oswa mwens." }, { status: 400 });
  }
  if (anonymous != null && typeof anonymous !== "boolean") {
    return NextResponse.json({ error: "Chwa anonim lan pa valab." }, { status: 400 });
  }

  // Optional: link to the logged-in bettor (if any).
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));

  // Rate limit: 5 donations per hour per IP.
  const ip = clientIp(req);
  const rl = await rateLimit("team_donation", ip, 5, 60 * 60_000);
  if (!rl.available) return NextResponse.json({ error: "Sèvis la pa disponib kounye a." }, { status: 503 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann sipò. Eseye ankò pita." }, { status: 429 });
  }

  const result = await initiateDonation({
    teamId: id,
    amountCentimes: BigInt(amountCentimes),
    provider: providerName,
    donorBettorId: bettor?.id,
    donorName,
    anonymous: anonymous ?? true,
    message,
    returnUrl: `/team-detail`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json(result);
}
