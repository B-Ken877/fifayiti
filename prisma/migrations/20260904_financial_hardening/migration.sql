-- FIFAYITI PostgreSQL financial hardening
--
-- IMPORTANT:
--   Run this against a RESTORED COPY of production first.
--   This migration intentionally fails if existing data violates a new
--   invariant. Do not remove a constraint to make the migration pass.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Immutable financial transaction header / idempotency boundary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "FinancialTransaction" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'HTG',
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "metadata" TEXT,
  "createdBy" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialTransaction_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX IF NOT EXISTS "FinancialTransaction_status_createdAt_idx"
  ON "FinancialTransaction" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "FinancialTransaction_reference_idx"
  ON "FinancialTransaction" ("referenceType", "referenceId");
CREATE INDEX IF NOT EXISTS "FinancialTransaction_type_createdAt_idx"
  ON "FinancialTransaction" ("type", "createdAt");

-- Backfill a header for every legacy AccountEntry transaction group.
-- These rows are historical POSTED adjustments because the old schema had
-- no transaction header. They preserve history without inventing new money.
INSERT INTO "FinancialTransaction"
  ("id", "type", "status", "currency", "idempotencyKey", "referenceType", "referenceId", "createdAt", "updatedAt", "postedAt")
SELECT DISTINCT
  ae."transactionId",
  'ADJUSTMENT',
  'POSTED',
  COALESCE(a."currency", 'HTG'),
  'legacy-account-entry:' || ae."transactionId",
  'legacy_account_entry_group',
  ae."transactionId",
  MIN(ae."createdAt") OVER (PARTITION BY ae."transactionId"),
  MIN(ae."createdAt") OVER (PARTITION BY ae."transactionId"),
  MIN(ae."createdAt") OVER (PARTITION BY ae."transactionId")
FROM "AccountEntry" ae
LEFT JOIN "Account" a ON a."id" = ae."accountId"
WHERE NOT EXISTS (
  SELECT 1 FROM "FinancialTransaction" ft WHERE ft."id" = ae."transactionId"
);

-- Link AccountEntry to the immutable transaction header.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountEntry_transactionId_fkey'
  ) THEN
    ALTER TABLE "AccountEntry"
      ADD CONSTRAINT "AccountEntry_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Account semantics: explicit normal balance + non-negative projection
-- ---------------------------------------------------------------------------
ALTER TABLE "Account"
  ADD COLUMN IF NOT EXISTS "normalBalance" TEXT NOT NULL DEFAULT 'CREDIT';

UPDATE "Account"
SET "normalBalance" = 'DEBIT'
WHERE "type" = 'platform_custody';

ALTER TABLE "Account"
  DROP CONSTRAINT IF EXISTS "Account_normalBalance_check";
ALTER TABLE "Account"
  ADD CONSTRAINT "Account_normalBalance_check"
  CHECK ("normalBalance" IN ('DEBIT', 'CREDIT'));

ALTER TABLE "Account"
  DROP CONSTRAINT IF EXISTS "Account_balanceCentimes_nonnegative";
ALTER TABLE "Account"
  ADD CONSTRAINT "Account_balanceCentimes_nonnegative"
  CHECK ("balanceCentimes" >= 0);

-- Prevent ambiguous ownership shapes. Known account types are explicit;
-- unknown future types are rejected until deliberately added by migration.
ALTER TABLE "Account"
  DROP CONSTRAINT IF EXISTS "Account_owner_shape_check";
ALTER TABLE "Account"
  ADD CONSTRAINT "Account_owner_shape_check"
  CHECK (
    ("type" IN ('platform_custody', 'platform_revenue', 'platform_settlement')
      AND "bettorId" IS NULL AND "teamId" IS NULL AND "playerId" IS NULL)
    OR
    ("type" IN ('bettor_available', 'bettor_reserved')
      AND "bettorId" IS NOT NULL AND "teamId" IS NULL AND "playerId" IS NULL)
    OR
    ("type" = 'team_support'
      AND "bettorId" IS NULL AND "teamId" IS NOT NULL AND "playerId" IS NULL)
    OR
    ("type" = 'player_earnings'
      AND "bettorId" IS NULL AND "teamId" IS NULL AND "playerId" IS NOT NULL)
  );

-- Race-proof one-account-per-owner invariants. PostgreSQL unique indexes
-- normally treat NULLs as distinct, so partial indexes are intentional.
CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_platform_custody_currency_uidx"
  ON "Account" ("currency")
  WHERE "type" = 'platform_custody';
CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_platform_revenue_currency_uidx"
  ON "Account" ("currency")
  WHERE "type" = 'platform_revenue';
CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_platform_settlement_currency_uidx"
  ON "Account" ("currency")
  WHERE "type" = 'platform_settlement';
CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_bettor_available_currency_uidx"
  ON "Account" ("bettorId", "currency")
  WHERE "type" = 'bettor_available';
CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_bettor_reserved_currency_uidx"
  ON "Account" ("bettorId", "currency")
  WHERE "type" = 'bettor_reserved';
CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_team_support_currency_uidx"
  ON "Account" ("teamId", "currency")
  WHERE "type" = 'team_support';
CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_player_earnings_currency_uidx"
  ON "Account" ("playerId", "currency")
  WHERE "type" = 'player_earnings';

-- ---------------------------------------------------------------------------
-- 3. AccountEntry invariants
-- ---------------------------------------------------------------------------
ALTER TABLE "AccountEntry"
  DROP CONSTRAINT IF EXISTS "AccountEntry_amount_positive";
ALTER TABLE "AccountEntry"
  ADD CONSTRAINT "AccountEntry_amount_positive"
  CHECK ("amountCentimes" > 0);

ALTER TABLE "AccountEntry"
  DROP CONSTRAINT IF EXISTS "AccountEntry_direction_check";
ALTER TABLE "AccountEntry"
  ADD CONSTRAINT "AccountEntry_direction_check"
  CHECK ("direction" IN ('debit', 'credit'));

CREATE INDEX IF NOT EXISTS "AccountEntry_transactionId_createdAt_idx"
  ON "AccountEntry" ("transactionId", "createdAt");

-- ---------------------------------------------------------------------------
-- 4. Critical event integrity
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "OfficialEvent_match_sequence_uidx"
  ON "OfficialEvent" ("matchId", "sequenceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "OfficialEvent_matchEventId_uidx"
  ON "OfficialEvent" ("matchEventId")
  WHERE "matchEventId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OfficialEvent_matchEventId_fkey'
  ) THEN
    ALTER TABLE "OfficialEvent"
      ADD CONSTRAINT "OfficialEvent_matchEventId_fkey"
      FOREIGN KEY ("matchEventId") REFERENCES "MatchEvent"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SettlementTransaction_settleEventId_fkey'
  ) THEN
    ALTER TABLE "SettlementTransaction"
      ADD CONSTRAINT "SettlementTransaction_settleEventId_fkey"
      FOREIGN KEY ("settleEventId") REFERENCES "OfficialEvent"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. BetOrder market/selection integrity
-- ---------------------------------------------------------------------------
-- A selection is uniquely identified inside a market. Add a composite unique
-- key so BetOrder can reference (marketId, selectionId) atomically.
CREATE UNIQUE INDEX IF NOT EXISTS "MarketSelection_marketId_id_uidx"
  ON "MarketSelection" ("marketId", "id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BetOrder_market_selection_fkey'
  ) THEN
    ALTER TABLE "BetOrder"
      ADD CONSTRAINT "BetOrder_market_selection_fkey"
      FOREIGN KEY ("marketId", "selectionId")
      REFERENCES "MarketSelection"("marketId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Financial/domain deletion must not silently erase history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Wallet_bettorId_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE CASCADE%'
  ) THEN
    ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_bettorId_fkey";
    ALTER TABLE "Wallet"
      ADD CONSTRAINT "Wallet_bettorId_fkey"
      FOREIGN KEY ("bettorId") REFERENCES "Bettor"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'LedgerEntry_bettorId_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE CASCADE%'
  ) THEN
    ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_bettorId_fkey";
    ALTER TABLE "LedgerEntry"
      ADD CONSTRAINT "LedgerEntry_bettorId_fkey"
      FOREIGN KEY ("bettorId") REFERENCES "Bettor"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Posted transaction/entry immutability
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "fifayiti_block_posted_financial_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tx_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'FinancialTransaction' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD."status" = 'POSTED' THEN
        RAISE EXCEPTION 'Posted FinancialTransaction % is immutable', OLD."id";
      END IF;
      RETURN OLD;
    END IF;

    IF OLD."status" = 'POSTED' THEN
      RAISE EXCEPTION 'Posted FinancialTransaction % is immutable', OLD."id";
    END IF;
    RETURN NEW;
  END IF;

  SELECT "status" INTO tx_status
  FROM "FinancialTransaction"
  WHERE "id" = COALESCE(NEW."transactionId", OLD."transactionId");

  IF tx_status = 'POSTED' THEN
    RAISE EXCEPTION 'AccountEntry for posted transaction is immutable';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS "FinancialTransaction_immutable_posted" ON "FinancialTransaction";
CREATE TRIGGER "FinancialTransaction_immutable_posted"
BEFORE UPDATE OR DELETE ON "FinancialTransaction"
FOR EACH ROW EXECUTE FUNCTION "fifayiti_block_posted_financial_mutation"();

DROP TRIGGER IF EXISTS "AccountEntry_immutable_posted" ON "AccountEntry";
CREATE TRIGGER "AccountEntry_immutable_posted"
BEFORE UPDATE OR DELETE ON "AccountEntry"
FOR EACH ROW EXECUTE FUNCTION "fifayiti_block_posted_financial_mutation"();

-- ---------------------------------------------------------------------------
-- 7. Database-level balance and posted-transaction validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "fifayiti_validate_financial_transaction"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tx_id TEXT;
  tx_status TEXT;
  debit_total NUMERIC;
  credit_total NUMERIC;
  entry_count BIGINT;
BEGIN
  tx_id := COALESCE(NEW."transactionId", OLD."transactionId");

  SELECT "status" INTO tx_status
  FROM "FinancialTransaction"
  WHERE "id" = tx_id;

  IF tx_status IS NULL THEN
    RAISE EXCEPTION 'Financial transaction % does not exist', tx_id;
  END IF;

  IF tx_status = 'POSTED' THEN
    SELECT COUNT(*),
           COALESCE(SUM(CASE WHEN "direction" = 'debit' THEN "amountCentimes" ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN "direction" = 'credit' THEN "amountCentimes" ELSE 0 END), 0)
    INTO entry_count, debit_total, credit_total
    FROM "AccountEntry"
    WHERE "transactionId" = tx_id;

    IF entry_count < 2 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'Transaction % is not balanced: entries=%, debits=%, credits=%',
        tx_id, entry_count, debit_total, credit_total;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Constraint trigger is deferred so a transaction may insert both sides and
-- then mark the header POSTED; validation happens at COMMIT.
DROP TRIGGER IF EXISTS "FinancialTransaction_validate_deferred" ON "FinancialTransaction";
CREATE CONSTRAINT TRIGGER "FinancialTransaction_validate_deferred"
AFTER INSERT OR UPDATE OF "status" ON "FinancialTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fifayiti_validate_financial_transaction"();

DROP TRIGGER IF EXISTS "AccountEntry_validate_deferred" ON "AccountEntry";
CREATE CONSTRAINT TRIGGER "AccountEntry_validate_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "AccountEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fifayiti_validate_financial_transaction"();

-- ---------------------------------------------------------------------------
-- 8. Reconciliation view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "financial_account_reconciliation" AS
SELECT
  a."id" AS "accountId",
  a."type",
  a."normalBalance",
  a."currency",
  a."balanceCentimes" AS "storedBalanceCentimes",
  COALESCE(SUM(
    CASE
      WHEN a."normalBalance" = 'DEBIT' AND ae."direction" = 'debit' THEN ae."amountCentimes"
      WHEN a."normalBalance" = 'DEBIT' AND ae."direction" = 'credit' THEN -ae."amountCentimes"
      WHEN a."normalBalance" = 'CREDIT' AND ae."direction" = 'credit' THEN ae."amountCentimes"
      WHEN a."normalBalance" = 'CREDIT' AND ae."direction" = 'debit' THEN -ae."amountCentimes"
      ELSE 0
    END
  ), 0) AS "calculatedBalanceCentimes",
  a."balanceCentimes" - COALESCE(SUM(
    CASE
      WHEN a."normalBalance" = 'DEBIT' AND ae."direction" = 'debit' THEN ae."amountCentimes"
      WHEN a."normalBalance" = 'DEBIT' AND ae."direction" = 'credit' THEN -ae."amountCentimes"
      WHEN a."normalBalance" = 'CREDIT' AND ae."direction" = 'credit' THEN ae."amountCentimes"
      WHEN a."normalBalance" = 'CREDIT' AND ae."direction" = 'debit' THEN -ae."amountCentimes"
      ELSE 0
    END
  ), 0) AS "differenceCentimes"
FROM "Account" a
LEFT JOIN "AccountEntry" ae ON ae."accountId" = a."id"
GROUP BY a."id";

COMMIT;
