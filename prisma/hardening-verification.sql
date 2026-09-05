-- FIFAYITI PostgreSQL hardening verification
-- Every query below should return ZERO rows unless explicitly noted.

-- 1. AccountEntry must never contain zero/negative amounts.
SELECT "id", "amountCentimes" FROM "AccountEntry"
WHERE "amountCentimes" <= 0;

-- 2. AccountEntry direction must be valid.
SELECT "id", "direction" FROM "AccountEntry"
WHERE "direction" NOT IN ('debit', 'credit');

-- 3. Every AccountEntry must have a FinancialTransaction.
SELECT ae."id", ae."transactionId"
FROM "AccountEntry" ae
LEFT JOIN "FinancialTransaction" ft ON ft."id" = ae."transactionId"
WHERE ft."id" IS NULL;

-- 4. Posted transactions must be balanced and contain >=2 entries.
SELECT
  ft."id",
  COUNT(ae."id") AS entry_count,
  COALESCE(SUM(CASE WHEN ae."direction"='debit' THEN ae."amountCentimes" ELSE 0 END),0) AS debits,
  COALESCE(SUM(CASE WHEN ae."direction"='credit' THEN ae."amountCentimes" ELSE 0 END),0) AS credits
FROM "FinancialTransaction" ft
LEFT JOIN "AccountEntry" ae ON ae."transactionId"=ft."id"
WHERE ft."status"='POSTED'
GROUP BY ft."id"
HAVING COUNT(ae."id") < 2
    OR COALESCE(SUM(CASE WHEN ae."direction"='debit' THEN ae."amountCentimes" ELSE 0 END),0)
       <> COALESCE(SUM(CASE WHEN ae."direction"='credit' THEN ae."amountCentimes" ELSE 0 END),0);

-- 5. Stored account balances must reconcile exactly to entry history.
SELECT * FROM "financial_account_reconciliation"
WHERE "differenceCentimes" <> 0;

-- 6. No negative stored balances.
SELECT "id", "balanceCentimes" FROM "Account"
WHERE "balanceCentimes" < 0;

-- 7. Official event sequence must be unique per match.
SELECT "matchId", "sequenceNumber", COUNT(*)
FROM "OfficialEvent"
GROUP BY "matchId", "sequenceNumber"
HAVING COUNT(*) > 1;

-- 8. Every settlement event reference must resolve.
SELECT st."id", st."settleEventId"
FROM "SettlementTransaction" st
LEFT JOIN "OfficialEvent" oe ON oe."id"=st."settleEventId"
WHERE oe."id" IS NULL;

-- 9. Every bet selection must belong to the same market as the bet.
SELECT bo."id", bo."marketId", bo."selectionId", ms."marketId" AS selection_market
FROM "BetOrder" bo
JOIN "MarketSelection" ms ON ms."id"=bo."selectionId"
WHERE bo."marketId" <> ms."marketId";

-- 10. Financial accounts must have valid owner shapes.
SELECT "id", "type", "bettorId", "teamId", "playerId"
FROM "Account"
WHERE NOT (
    ("type" IN ('platform_custody','platform_revenue','platform_settlement')
      AND "bettorId" IS NULL AND "teamId" IS NULL AND "playerId" IS NULL)
 OR ("type" IN ('bettor_available','bettor_reserved')
      AND "bettorId" IS NOT NULL AND "teamId" IS NULL AND "playerId" IS NULL)
 OR ("type"='team_support'
      AND "bettorId" IS NULL AND "teamId" IS NOT NULL AND "playerId" IS NULL)
 OR ("type"='player_earnings'
      AND "bettorId" IS NULL AND "teamId" IS NULL AND "playerId" IS NOT NULL)
);

-- 11. SIPÒ allocation totals/counts.
SELECT
  d."id",
  d."eligiblePlayerCount",
  COUNT(pa."id") AS allocation_count,
  d."totalAmountCentimes",
  COALESCE(SUM(pa."amountCentimes"),0) AS allocation_total,
  d."remainderRecipients",
  COUNT(*) FILTER (WHERE pa."amountCentimes" = d."perPlayerAmountCentimes" + 1) AS plus_one_count
FROM "TeamSupportDistribution" d
LEFT JOIN "PlayerAllocation" pa ON pa."distributionId"=d."id"
GROUP BY d."id"
HAVING d."status"='COMPLETED'
   AND (
      COUNT(pa."id") <> d."eligiblePlayerCount"
      OR COALESCE(SUM(pa."amountCentimes"),0) <> d."totalAmountCentimes"
      OR COUNT(*) FILTER (WHERE pa."amountCentimes" = d."perPlayerAmountCentimes" + 1) <> d."remainderRecipients"
   );

-- 12. Legacy LedgerEntry must stop growing after cutover.
-- Capture this number before cutover and verify it remains unchanged.
SELECT COUNT(*) AS legacy_ledger_entry_count FROM "LedgerEntry";

-- 13. PaymentIntent provider IDs must be unique when present.
SELECT "provider", "providerPaymentId", COUNT(*)
FROM "PaymentIntent"
WHERE "providerPaymentId" IS NOT NULL
GROUP BY "provider", "providerPaymentId"
HAVING COUNT(*) > 1;
