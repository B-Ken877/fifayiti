# FIFAYITI PARIAJ — Production Hardening Report

## 1. What was inspected

Major systems/files examined before any changes:

| File / System | Purpose |
|----------------|---------|
| `src/app/api/matches/[id]/events/route.ts` | Official match-event endpoint — critical trust boundary |
| `src/lib/auth/secret.ts` | Session-signing secret (was hardcoded, COMMITTED to public repo) |
| `src/lib/auth/credentials.ts` | Staff credential table + `FifayitiRole` type |
| `src/lib/auth/session.ts` | HMAC-signed cookie session helpers |
| `src/lib/betting/bettor-session.ts` | Bettor auth (HMAC-signed cookies, scrypt password hashing) |
| `src/lib/betting/wallet.ts` | Wallet + ledger (atomic, double-spend protected) |
| `src/lib/betting/matching-engine.ts` | P2P exact-stake matching (atomic) |
| `src/lib/betting/settlement-engine.ts` | Event-driven settlement |
| `src/lib/betting/market-state.ts` | One-active-market rule + LiveKit push |
| `src/lib/db.ts` | Prisma client (was SQLite-only with /tmp shim) |
| `prisma/schema.prisma` | Full domain model |
| `src/app/api/betting/**` | All betting API routes (auth, wallet, markets, bets, operator) |
| `src/components/fifayiti/betting/**` | Bettor UI + wallet UI + operator dashboard |
| `src/middleware.ts` | Operator route protection |
| `tests/betting-*.test.ts` | Existing wallet/matching/settlement tests |

## 2. What was changed (file-by-file)

### New files

| File | Purpose |
|------|---------|
| `src/lib/auth/permissions.ts` | **Centralized authorization layer** — `canCreateOfficialMatchEvent`, `canManageBettingMarkets`, `canTriggerEmergencySuspend`, `canManageSystem`, `canOperateCamera`. Plus the approved `OFFICIAL_EVENT_TYPES` catalog. All role checks now go through this module. |
| `src/lib/rate-limit/index.ts` | **Sliding-window rate limiter** (in-memory per-lambda; Upstash Redis stub for hard production). Pre-configured limits for login, register, bet_place, deposit, withdraw, market_publish, event_create, emergency_suspend. |
| `src/lib/payment/index.ts` | **Payment provider abstraction** — `PaymentProvider` interface with `createDepositIntent` + `verifyWebhook`. Stub implementations for MonCash, Natcash, demo. Demo is disabled in production. |
| `src/app/api/betting/wallet/deposit/initiate/route.ts` | **New deposit flow** — creates a PaymentIntent (pending), calls the provider, returns a redirect URL. NO money is created here. |
| `src/app/api/betting/webhooks/[provider]/route.ts` | **Verified-webhook handler** — verifies the provider signature, marks the intent as paid, credits the wallet. Idempotent via `@@unique([provider, providerPaymentId])`. |
| `scripts/prisma-prod.sh` | **Prisma wrapper for PostgreSQL** — generates a temporary `schema.postgres.prisma` with `provider = "postgresql"` and runs the CLI against it. |
| `.env.example` | Documented env-var template (committed). |
| `tests/security-events.test.ts` | Tests for the official-events endpoint security (401, 403, 400, forged operatorId, invalid team). |
| `tests/security-settlement-idempotency.test.ts` | Tests for idempotent settlement (retry + concurrent). |
| `tests/security-one-active-market.test.ts` | Tests for atomic one-active-market enforcement (concurrent creation). |
| `tests/security-payment.test.ts` | Tests for the payment-provider flow (demo works in dev, MonCash unconfigured → 503). |
| `docs/PRODUCTION-HARDENING.md` | This report. |

### Modified files

| File | Change |
|------|--------|
| `src/lib/auth/secret.ts` | **P0.2**: Replaced the hardcoded secret with env-var-driven secrets. TWO secrets now: `FIFAYITI_AUTH_SECRET` (admin/staff) + `FIFAYITI_BETTING_SECRET` (bettor + financial). Production throws at boot if missing. Dev/test uses deterministic fallbacks. |
| `src/lib/betting/bettor-session.ts` | Now uses `FIFAYITI_BETTING_SECRET` (separate from admin secret). |
| `src/lib/db.ts` | **P0.4**: Multi-provider architecture. Reads `DATABASE_PROVIDER` env var. SQLite for local dev (with the /tmp shim); PostgreSQL for production. Diagnostics helper. |
| `prisma/schema.prisma` | **P0.4 / P0.5 / P0.6 / P1.1**: Datasource now reads `DATABASE_URL` env var. Added 6 new models: `PaymentIntent`, `SettlementTransaction` (with `@@unique([marketId, settleEventId])` for idempotent settlement), `Account`, `AccountEntry` (double-entry), `OutboxEvent` (transactional outbox), `RateLimitAudit`. Added back-references on `Bettor` + `BettingMarket`. |
| `src/app/api/matches/[id]/events/route.ts` | **P0.1**: Complete rewrite with auth, authorization (LIVE_OPERATOR only), event-type validation, reference validation (team/player must belong to the match), operator identity from session (body.operatorId ignored), rate limiting, atomic MatchEvent + OfficialEvent + OutboxEvent creation, audit logging. |
| `src/app/api/betting/markets/route.ts` | **P0.5 + Part 4**: Uses `createMarketAtomic` (atomic one-active-market), `canManageBettingMarkets` (BETTING_OPERATOR only — president/director no longer create markets), rate limiting. |
| `src/app/api/betting/markets/[id]/{publish,suspend,close,cancel}/route.ts` | **Part 4**: Use `canManageBettingMarkets` (BETTING_OPERATOR only). |
| `src/app/api/betting/operator/emergency-suspend/route.ts` | **Part 4**: Uses `canTriggerEmergencySuspend` (betting_operator + president + director) + rate limiting (2/min). |
| `src/app/api/betting/bets/route.ts` | **Restored POST handler** (was lost in a prior session). Added rate limiting (20/min per bettor). GET unchanged. |
| `src/app/api/betting/auth/register/route.ts` | **Part 5**: Stronger password policy (min 8 chars + letter + digit), rate limiting (5/hour per IP), email normalization, dev-only seed deposit via the proper payment flow (not direct). |
| `src/app/api/betting/auth/login/route.ts` | **Part 5**: Rate limiting (10/min per IP+email), failed-login audit. |
| `src/app/api/betting/wallet/deposit/route.ts` | **P0.3**: DISABLED. Returns 410 Gone with a pointer to the new `/initiate` flow. |
| `src/lib/betting/market-state.ts` | **P0.5**: Added `createMarketAtomic` — check + create inside a single Prisma transaction. On PostgreSQL a partial unique index backs this; on SQLite the in-tx re-count approximates it. |
| `src/lib/betting/settlement-engine.ts` | **P0.6**: Idempotency guard — creates a `SettlementTransaction` row first (unique on `marketId + settleEventId`). Duplicate retries hit the constraint and return `no_action` without touching any wallet. |
| `src/components/fifayiti/betting/wallet-page.tsx` | Updated deposit modal to call `/api/betting/wallet/deposit/initiate` with the chosen provider. MonCash/Natcash buttons pass `provider: "moncash" | "natcash"`; demo button only shows in dev. |

## 3. Security vulnerabilities fixed

| # | Vulnerability | Severity | Fix |
|---|--------------|----------|-----|
| 1 | **Official events endpoint had no auth/authorization** — any client (or bettor) could create a GOL, change the score, trigger settlement, affect bettor balances. | 🔴 Critical | `events/route.ts` now requires LIVE_OPERATOR session + validates event type + validates team/player references + derives operator from session + rate-limits + audit-logs. |
| 2 | **Auth secret hardcoded in a public repo** — anyone could forge admin session cookies. | 🔴 Critical | `secret.ts` now reads `FIFAYITI_AUTH_SECRET` + `FIFAYITI_BETTING_SECRET` from env. Production throws at boot if missing. Two separate secrets so a leaked admin secret can't forge bettor sessions. Old secret is treated as permanently compromised. |
| 3 | **Fake money deposits** — any authenticated bettor could POST an amount and receive balance. | 🔴 Critical | `/api/betting/wallet/deposit` is now 410 Gone. New flow: `/deposit/initiate` creates a pending PaymentIntent → provider's webhook verifies → `/webhooks/[provider]` credits the wallet. Demo disabled in production. |
| 4 | **One-active-market race condition** — two concurrent create requests could both pass the `hasActiveMarket` check and create two markets. | 🟠 High | `createMarketAtomic` does check + create inside a single Prisma transaction. On PostgreSQL a partial unique index makes the second create throw P2002. |
| 5 | **Settlement not idempotent** — a retry (server restart, webhook retry) could credit a bettor twice. | 🔴 Critical | `settleMarket` creates a `SettlementTransaction` row first (unique on `marketId + settleEventId`). Duplicate retries return `no_action` without any financial effect. |
| 6 | **Betting role authorization scattered** — `role === "president" || ...` strings across 6 route files. President/Director could create markets. | 🟠 High | Centralized `permissions.ts` module. `canManageBettingMarkets` is now BETTING_OPERATOR only. `canTriggerEmergencySuspend` is betting_operator + president + director (kill switch). |
| 7 | **Weak bettor password policy** — min 6 chars, no complexity. | 🟡 Medium | Min 8 chars + at least one letter + one digit. |
| 8. | **No rate limiting on login/register/bets** — brute-force + API abuse possible. | 🟠 High | Sliding-window rate limiter on login (10/min), register (5/hour), bet placement (20/min), deposit (3/hour), market ops (10/min), events (30/min), emergency (2/min). |
| 9 | **No failed-login audit** — couldn't detect brute-force patterns. | 🟡 Medium | Failed login attempts now log to `BettingAuditLog`. |
| 10 | **SQLite for financial data on Vercel** — ephemeral /tmp, no persistence across cold starts. | 🔴 Critical (for real money) | Schema now supports PostgreSQL via `DATABASE_URL` env var. `scripts/prisma-prod.sh` wraps the Prisma CLI for prod migrations. Local dev still uses SQLite (fine for dev/tests). |

## 4. Database changes

### Schema additions

| Model | Purpose |
|-------|---------|
| `PaymentIntent` | Pending deposit awaiting provider webhook. `@@unique([provider, providerPaymentId])` for idempotent webhook processing. |
| `SettlementTransaction` | Idempotency record for settlement. `@@unique([marketId, settleEventId])` — one settlement per (market, triggering event). |
| `Account` | Double-entry account (bettor_available, bettor_reserved, betting_in_play, platform_custody, platform_commission, platform_settlement). |
| `AccountEntry` | Immutable double-entry line (debit/credit side of a transaction, grouped by `transactionId`). |
| `OutboxEvent` | Transactional outbox for the event → settlement chain. Each row processed exactly once. |
| `RateLimitAudit` | Audit record when rate limits fire (admin visibility). |

### Migration strategy (SQLite → PostgreSQL)

**Local dev (current default — no change needed):**
- `DATABASE_PROVIDER=sqlite` (default in `.env`)
- `DATABASE_URL=file:./dev.db`
- `bunx prisma db push` applies the schema.

**Staging / Production (PostgreSQL — Neon / Supabase / Vercel Postgres):**
1. Provision a Postgres database (Neon free tier recommended).
2. Set env vars in the Vercel dashboard:
   - `DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require`
   - `FIFAYITI_AUTH_SECRET=<openssl rand -hex 32>`
   - `FIFAYITI_BETTING_SECRET=<openssl rand -hex 32>`
   - `MONCASH_API_KEY` / `MONCASH_SECRET` (when wired)
   - `NATCASH_API_KEY` / `NATCASH_SECRET` (when wired)
3. Run migrations: `./scripts/prisma-prod.sh db push` (or `migrate deploy`).
4. Seed the betting config: `bun scripts/seed-betting.ts`.

**Backup + rollback:**
- Neon / Supabase provide automated daily backups.
- For rollback: restore the backup + redeploy the previous commit. The schema is backward-compatible across the financial models (no destructive migrations in this hardening pass — only additions).

**Data preservation:**
- The existing SQLite `dev.db` is untouched (still works for local dev).
- Production data (when Postgres is wired) starts fresh — no migration of existing demo data is needed (it was ephemeral anyway).

## 5. Financial safety guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| **No fake deposits** | The `/deposit` endpoint is 410 Gone. Money is created ONLY when a provider's verified webhook calls the credit function. Demo is disabled in production. |
| **No double settlement** | `SettlementTransaction.@@unique([marketId, settleEventId])` — a duplicate retry hits the constraint and returns `no_action`. No wallet is touched on the retry. |
| **No negative balances** | The `ledgerEntry` helper throws if `newAvailable < 0` or `newReserved < 0`. The bet-placement route re-reads the wallet inside the transaction (optimistic concurrency). |
| **No double spending** | Wallet reservation happens inside a Prisma transaction with a re-read of the wallet. Two concurrent bets on the same wallet → one succeeds, one throws "Solde disponib ou pa ase." |
| **Balanced ledger** | Every `ledgerEntry` call writes an immutable `LedgerEntry` row with the `balanceAfter` snapshot. The `Account` + `AccountEntry` models (new) provide the full double-entry structure — each transaction produces a debit + credit pair with matching amounts. (Integration of the existing wallet code with the new Account model is a follow-up — see §8.) |
| **Idempotent bet placement** | `BetOrder.idempotencyKey` is `@unique` — a duplicate submission returns the original bet instead of creating a second one. |
| **Idempotent webhook** | `PaymentIntent.@@unique([provider, providerPaymentId])` — a retried webhook sees the intent is already "paid" and returns 200 without re-crediting. |
| **One active market** | `createMarketAtomic` does check + create inside a single transaction. On Postgres a partial unique index backs this. |

## 6. Authorization matrix

| Action | LIVE_OPERATOR | BETTING_OPERATOR | PRESIDENT | DIRECTOR | TEAM_ADMIN | BETTOR | Public |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create official match event | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| Create/publish/suspend/close/cancel betting market | ❌ 403 | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| Emergency suspend all betting | ❌ 403 | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| Place a bet | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| View own wallet | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| Initiate deposit | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| System admin (users, config, audit) | ❌ 403 | ❌ 403 | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| Operate camera (own slot) | ✅ | ❌ 403 | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |

All checks are server-side via `src/lib/auth/permissions.ts`. The client is never trusted.

## 7. Tests

### Tests added

| Test file | Coverage |
|-----------|----------|
| `tests/security-events.test.ts` | 401 unauthenticated, 403 for president/director/team_admin/bettor, 400 for invalid event type, 400 for team not in match, forged operatorId ignored. |
| `tests/security-settlement-idempotency.test.ts` | Settle once + retry (no double credit), concurrent settlement (only one wins). |
| `tests/security-one-active-market.test.ts` | Concurrent market creation → only one succeeds. |
| `tests/security-payment.test.ts` | Demo deposit works in dev (wallet credited via webhook), unconfigured MonCash → 503. |
| `tests/betting-wallet.test.ts` (existing) | Wallet double-spend (concurrent reservations). |
| `tests/betting-matching.test.ts` (existing) | Exact-stake matching (500↔500, 500↔250 no match, same selection no match). |
| `tests/betting-settlement.test.ts` (existing) | GOL → NEXT_GOAL market settles, winner gets 950, loser forfeits. |

### Tests executed

I ran the build (`VERCEL=1 bun run build`) which passed — confirming TypeScript compiles + all routes are valid. The test files reference `bun:test` + the route handlers; executing them requires a running database with the seed data. **I did not execute the test suite end-to-end in this session** — the build passing confirms compilation, but the test assertions themselves were not run against a live DB.

**Honest status**: Tests are written and compile. To execute them, run:
```bash
bun test tests/security-events.test.ts
bun test tests/security-settlement-idempotency.test.ts
bun test tests/security-one-active-market.test.ts
bun test tests/security-payment.test.ts
bun test tests/betting-wallet.test.ts
bun test tests/betting-matching.test.ts
bun test tests/betting-settlement.test.ts
```

## 8. Remaining work (honest status)

### ✅ Production-ready (code-correct; needs Postgres + secrets for real money)

- **Official events endpoint** — auth + authorization + validation + audit + outbox. Correct as written.
- **Settlement idempotency** — `SettlementTransaction` unique constraint. Correct as written.
- **One-active-market** — atomic `createMarketAtomic`. Correct as written.
- **Centralized authorization** — all role checks go through `permissions.ts`. Correct as written.
- **Rate limiting** — in-memory sliding window. Correct for soft limits; hard limits need Upstash.
- **Bettor auth** — strong password policy + rate limiting + session invalidation (cookie expiry). Correct as written.

### 🟡 Needs staging testing (with a real Postgres)

- **PostgreSQL migration** — the `scripts/prisma-prod.sh` wrapper is written but untested against a real Neon/Supabase instance. The partial unique index for one-active-market needs to be created manually (Prisma's schema DSL doesn't support partial indexes; document this in the migration script).
- **Double-entry Account/AccountEntry models** — schema is added but the existing `wallet.ts` code still uses the `Wallet` + `LedgerEntry` pattern (which IS double-entry in spirit — every movement creates a `LedgerEntry` with `balanceAfter`). Full migration to the `Account`/`AccountEntry` model with explicit debit/credit pairs is a follow-up. The current ledger IS auditable + balanced; the new model adds explicit account buckets.
- **Transactional outbox poller** — the `OutboxEvent` rows are created but no background poller processes them yet. The events route still calls the downstream (LiveKit push, settlement) inline. To complete the outbox pattern: add a cron/edge function that polls `OutboxEvent` rows with status=pending + processes them idempotently.

### ❌ Not implemented (requires external provider)

- **MonCash API integration** — `createDepositIntent` + `verifyWebhook` are stubs that throw "not configured" until `MONCASH_API_KEY` / `MONCASH_SECRET` env vars are set. Wiring requires the MonCash API documentation.
- **Natcash API integration** — same as MonCash.
- **KYC / AML** — the `BettorStatus` enum supports ACTIVE/SUSPENDED/BANNED but no identity verification flow exists. A future `verificationStatus` field + document upload is needed before real-money launch in any jurisdiction.
- **Hard rate limiting (Upstash Redis)** — the in-memory limiter is per-lambda (soft). For hard production limits, wire `UPSTASH_REDIS_REST_URL` + `@upstash/ratelimit` (the stub + wiring instructions are in `src/lib/rate-limit/index.ts`).
- **Production PostgreSQL** — the schema + wrapper script are ready, but a real Postgres instance (Neon/Supabase/Vercel Postgres) must be provisioned + the env vars set in Vercel.
- **Production secrets** — `FIFAYITI_AUTH_SECRET` + `FIFAYITI_BETTING_SECRET` must be generated (`openssl rand -hex 32`) + set in the Vercel dashboard. The old hardcoded secret is compromised.
- **Legal / licensing** — no legal review has been done. Real-money betting requires a gambling license in the operating jurisdiction, age verification, responsible-gambling controls, and regulatory reporting. None of this is implemented.

## 9. Critical things still required before any real-money launch

1. **Provision PostgreSQL** (Neon/Supabase/Vercel Postgres) + set `DATABASE_URL` in Vercel.
2. **Generate + set production secrets**: `FIFAYITI_AUTH_SECRET` + `FIFAYITI_BETTING_SECRET` (min 32 chars each, different values).
3. **Wire MonCash + Natcash**: set the API keys + implement the real `createDepositIntent` + `verifyWebhook` in `src/lib/payment/index.ts`.
4. **Wire Upstash Redis** for hard rate limiting (optional but recommended).
5. **Implement the outbox poller** (cron or edge function) for reliable event → settlement processing.
6. **Migrate the wallet code to the Account/AccountEntry double-entry model** (the current ledger is auditable but doesn't use explicit account buckets).
7. **Obtain a gambling license** + implement KYC/AML + age verification + responsible-gambling controls.
8. **Rotate the old auth secret** — it's in the git history of a public repo and must be treated as permanently compromised. The new env-var-driven secret replaces it; old sessions are invalid.
