# Donation and Betting Hardening

This follow-up builds on `financial-db-hardening`, which is already merged
into `main`. New money movements continue to use the canonical
`FinancialTransaction` → `AccountEntry` ledger; `Wallet` is only a projection.

## Ledger rules

- Deposits increase platform custody and the bettor's available liability.
- Bet placement transfers available balance to reserved balance atomically
  with creation of the bet order.
- Matching transfers both stakes from reserved liabilities into the
  `platform_betting_pool` liability. It does not debit platform cash.
- Settlement debits the pool and credits the winning bettor and platform
  revenue in one balanced transaction.
- Cancellation refunds matched stakes from the pool and releases unmatched
  stakes from reserved balance. Domain status and ledger writes share one DB
  transaction.
- Donations only credit a team's support account after a verified provider
  callback. Payment intent, donation status, ledger transaction, and account
  balances commit together.

## Database migration

Apply `prisma/migrations/20261015_betting_pool_account/migration.sql` to the
production PostgreSQL database before deploying the application change. The
migration stops if it finds matched or settled legacy bets without canonical
match transactions. Reconcile those positions with the operator before
retrying; do not bypass the guard, since the old code could have updated
wallet projections outside the canonical ledger.

## Production configuration and remaining blockers

- Production rate limits use the shared Upstash Redis REST API. Configure
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; protected endpoints
  return 503 if the store is unavailable. Local development uses memory.
- The unsigned demo webhook and demo payment flows are unavailable in
  production.
- MonCash is intentionally left unimplemented. Natcash is also disabled:
  the repository adapter is still a stub, and no verified merchant API
  contract or credentials were supplied. Neither rail is advertised as live.
- Withdrawal/payout processing is not implemented. The wallet UI no longer
  pretends that a withdrawal request was submitted.
- Betting remains unavailable for real-money launch until jurisdictional
  licensing, age/KYC/AML, responsible-gambling controls, and settlement
  correction procedures are implemented and reviewed.
- A correction to an already-settled official event does not mint a refund.
  It leaves the posted ledger intact and writes an audit event requiring an
  audited reversal before the market can be reopened.

## Verification

The changes were statically reviewed. No test suite or production database
migration was run as part of this change. Validate the migration and payment
callbacks against a restored PostgreSQL staging database before deployment.
