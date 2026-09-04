// POST /api/teams/[id]/support/initiate — initiate a team support donation.
//
// Creates a PaymentIntent (pending) + a TeamDonation record. NO money is
// credited until the provider's webhook verifies. Uses the same payment
// provider abstraction as bettor deposits.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initiateDonation } from "@/lib/support/donation-service";
import { getAuthenticatedBettor } from "@/lib/betting/bettor-session";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { amountCentimes, provider, donorName, anonymous, message } = body;

  if (!amountCentimes || BigInt(amountCentimes) <= 0n) {
    return NextResponse.json({ error: "Montan pa valid." }, { status: 400 });
  }

  // Optional: link to the logged-in bettor (if any).
  const bettor = await getAuthenticatedBettor(req.headers.get("cookie"));

  // Rate limit: 5 donations per hour per IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit("team_donation", ip, 5, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop demann sipò. Eseye ankò pita." }, { status: 429 });
  }

  const result = await initiateDonation({
    teamId: id,
    amountCentimes: BigInt(amountCentimes),
    provider: provider ?? "demo",
    donorBettorId: bettor?.id,
    donorName,
    anonymous: anonymous ?? true,
    message,
    returnUrl: `/team-detail`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
