-- Matched stakes are liabilities owed to the betting pool, not a movement
-- of platform cash. The previous model incorrectly used custody as the
-- counter-account, which depleted cash on internal settlements.
BEGIN;

DO $$
DECLARE
  unresolved_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM "BetOrder" b
  WHERE b."status" IN ('MATCHED', 'SETTLED', 'MARKET_CANCELLED')
    AND NOT EXISTS (
      SELECT 1 FROM "FinancialTransaction" f
      WHERE f."idempotencyKey" = 'bet_match:' || b."id"
        AND f."status" = 'POSTED'
    );

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add betting-pool accounting while % legacy matched/settled bets need reconciliation',
      unresolved_count;
  END IF;
END $$;

ALTER TABLE "Account"
  DROP CONSTRAINT IF EXISTS "Account_owner_shape_check";
ALTER TABLE "Account"
  ADD CONSTRAINT "Account_owner_shape_check"
  CHECK (
    ("type" IN ('platform_custody', 'platform_revenue', 'platform_settlement', 'platform_betting_pool')
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

ALTER TABLE "Account"
  DROP CONSTRAINT IF EXISTS "Account_type_normal_balance_check";
ALTER TABLE "Account"
  ADD CONSTRAINT "Account_type_normal_balance_check"
  CHECK (
    ("type" IN ('platform_custody', 'platform_settlement') AND "normalBalance" = 'DEBIT')
    OR ("type" IN ('platform_revenue', 'platform_betting_pool', 'bettor_available', 'bettor_reserved', 'team_support', 'player_earnings') AND "normalBalance" = 'CREDIT')
  );

CREATE UNIQUE INDEX IF NOT EXISTS "Account_one_platform_betting_pool_currency_uidx"
  ON "Account" ("currency")
  WHERE "type" = 'platform_betting_pool';

COMMIT;
