# FIFAYITI Financial Cutover

## Canonical model

After this hardening change, the canonical financial path is:

`FinancialTransaction -> AccountEntry -> Account.balanceCentimes`

`LedgerEntry` is historical compatibility data only.

## Required code migrations

### Betting wallet
Replace `src/lib/betting/wallet.ts` and all direct `tx.wallet` / `tx.ledgerEntry.create` money mutations with account transfers through `postFinancialTransaction`.

Recommended accounts per bettor:
- `bettor_available`
- `bettor_reserved`

The Wallet model may remain as a read projection during transition, but it must not be an independent source of truth.

### Matching
A match must atomically:
1. mark both orders MATCHED;
2. transfer each bettor's reserved liability into the custody/clearing account according to the approved accounting design;
3. create one balanced FinancialTransaction per economic transfer or one balanced transaction containing all related lines;
4. never write LedgerEntry.

### Settlement
A settlement must atomically:
1. claim `(marketId, settleEventId)` through the unique SettlementTransaction key;
2. derive winners, stakes, payout and commission from actual matched orders;
3. create the required balanced financial transaction(s);
4. mark orders and market settled;
5. never create a zero-value AccountEntry;
6. never trust client-supplied payout values.

### Donation
A confirmed donation must create a balanced transaction from platform custody to the team support account. The external payment provider confirmation is the source event; the browser is never trusted.

### Distribution
A distribution must create a single atomic transaction containing:
- one debit from team support;
- one credit per eligible player earnings account.

The sum of player credits must exactly equal the team debit.

## Legacy data

Do not delete or rewrite old `LedgerEntry` rows. Preserve them as an audit/history record. Capture their count before cutover and verify the count never increases after cutover.

## Migration rule

Do not run this directly on production first. Restore production into staging, apply migration, run reconciliation, run tests, then promote.
