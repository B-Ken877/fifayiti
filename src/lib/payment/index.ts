// FIFAYITI — payment provider abstraction.
//
// ARCHITECTURE (spec P0.3):
//   The client NEVER directly creates a successful deposit. Real deposits
//   flow through this interface:
//
//     Bettor initiates deposit (UI) →
//       POST /api/betting/wallet/deposit/initiate (server) →
//         provider.createDepositIntent({...}) → returns a redirect/checkout URL →
//           bettor completes payment on the provider's domain →
//             provider sends a webhook to /api/betting/webhooks/[provider] →
//               webhook handler verifies the signature →
//                 server confirms the payment →
//                   ledger DEPOSIT + wallet balance update (atomic) →
//                     bettor sees the updated balance
//
// No money is created until the webhook verifies a real payment. The
// `initiateDeposit` route only CREATES A PENDING INTENT — it does not
// touch the wallet.
//
// INTEGRATION STATUS:
//   - MonCash: stub (createDepositIntent throws "not implemented")
//   - Natcash: stub (createDepositIntent throws "not implemented")
//   - Demo:    disabled in production (NODE_ENV=production throws)
//
// To wire a real provider, implement `createDepositIntent` + `verifyWebhook`
// for that provider and set the env vars (e.g. MONCASH_API_KEY,
// MONCASH_SECRET, NATCASH_API_KEY, NATCASH_SECRET).

/** A deposit intent — what the server returns to the client so they can
 *  redirect to the provider's checkout. */
export interface DepositIntent {
  intentId: string;       // our id (stored as a pending PaymentIntent)
  provider: "moncash" | "natcash" | "demo";
  amountCentimes: bigint;
  redirectUrl?: string;   // provider's checkout URL (null for demo)
  expiresAt: Date;
  status: "pending";
}

/** Verified webhook payload — what the provider sends us after a payment. */
export interface VerifiedPayment {
  provider: "moncash" | "natcash" | "demo";
  providerPaymentId: string;  // id from the provider
  intentId: string;           // our intent id (links back to the bettor)
  bettorId: string;
  amountCentimes: bigint;
  status: "paid" | "failed";
  paidAt: Date;
  rawPayload: string;         // the original webhook body (for audit)
}

export interface PaymentProvider {
  name: "moncash" | "natcash" | "demo";
  /** Create a deposit intent — returns a redirect URL the client opens. */
  createDepositIntent(opts: {
    intentId: string;
    bettorId: string;
    amountCentimes: bigint;
    returnUrl: string;
  }): Promise<DepositIntent>;

  /** Verify an incoming webhook (signature + payload). Throws on invalid. */
  verifyWebhook(headers: Record<string, string>, body: string): Promise<VerifiedPayment>;
}

// ── Stub providers ─────────────────────────────────────────────────────
// These are clean placeholders. They throw "not implemented" so the UI
// shows a clear "provider not configured" error rather than faking a
// successful deposit. When the real integration is wired, replace the
// bodies with actual API calls.

const notConfigured = (name: string) =>
  new Error(
    `${name} pa konfigire poko. Kontakte administratè a pou w aktive depo.`,
  );

const moncashProvider: PaymentProvider = {
  name: "moncash",
  async createDepositIntent(opts) {
    // TODO: POST to MonCash API to create a payment intent.
    // Requires env vars: MONCASH_API_KEY, MONCASH_SECRET, MONCASH_BASE_URL
    if (!process.env.MONCASH_API_KEY) throw notConfigured("MonCash");
    throw notConfigured("MonCash"); // unreachable until env vars are set
  },
  async verifyWebhook(_headers, _body) {
    // TODO: verify HMAC signature from MonCash webhook.
    throw notConfigured("MonCash");
  },
};

const natcashProvider: PaymentProvider = {
  name: "natcash",
  async createDepositIntent(opts) {
    // TODO: POST to Natcash API to create a payment intent.
    // Requires env vars: NATCASH_API_KEY, NATCASH_SECRET, NATCASH_BASE_URL
    if (!process.env.NATCASH_API_KEY) throw notConfigured("Natcash");
    throw notConfigured("Natcash"); // unreachable until env vars are set
  },
  async verifyWebhook(_headers, _body) {
    // TODO: verify signature from Natcash webhook.
    throw notConfigured("Natcash");
  },
};

const demoProvider: PaymentProvider = {
  name: "demo",
  async createDepositIntent(opts) {
    // Demo flow: no real payment — immediately "pays" via the webhook.
    // DISABLED in production (see /api/betting/wallet/deposit/initiate).
    return {
      intentId: opts.intentId,
      provider: "demo",
      amountCentimes: opts.amountCentimes,
      redirectUrl: undefined,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      status: "pending",
    };
  },
  async verifyWebhook(headers, body) {
    // Demo webhooks are "self-verified" — the initiate route fakes a
    // webhook call. In production this branch is dead code.
    const parsed = JSON.parse(body);
    return {
      provider: "demo",
      providerPaymentId: `demo-${Date.now()}`,
      intentId: parsed.intentId,
      bettorId: parsed.bettorId,
      amountCentimes: BigInt(parsed.amountCentimes),
      status: "paid",
      paidAt: new Date(),
      rawPayload: body,
    };
  },
};

export function getProvider(name: "moncash" | "natcash" | "demo"): PaymentProvider {
  if (name === "moncash") return moncashProvider;
  if (name === "natcash") return natcashProvider;
  return demoProvider;
}

/** Whether a provider is currently configured (env vars present). */
export function providerStatus(): { moncash: boolean; natcash: boolean; demo: boolean } {
  return {
    moncash: !!process.env.MONCASH_API_KEY && !!process.env.MONCASH_SECRET,
    natcash: !!process.env.NATCASH_API_KEY && !!process.env.NATCASH_SECRET,
    demo: process.env.NODE_ENV !== "production", // demo only in dev/test
  };
}
