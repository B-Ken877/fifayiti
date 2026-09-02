// POST /api/betting/wallet/deposit  (LEGACY — DISABLED, spec P0.3)
//
// This endpoint previously allowed an authenticated bettor to create a
// DEPOSIT ledger entry by submitting an amount — which is unacceptable
// for real-money betting. It has been replaced by the payment-provider
// flow at /api/betting/wallet/deposit/initiate + /api/betting/webhooks/[provider].
//
// This route now returns 410 Gone with a pointer to the new flow so any
// old client code gets a clear error instead of silently crediting money.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Endpoint sa a pa disponib ankò. Itilize /api/betting/wallet/deposit/initiate.",
      redirect: "/api/betting/wallet/deposit/initiate",
    },
    { status: 410 },
  );
}
