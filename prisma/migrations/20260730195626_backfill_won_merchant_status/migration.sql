-- One-time back-fill: any merchant that already has a won deal but isn't Active
-- becomes Active (matching the new "won deal activates the merchant" rule).
-- Covers both Prospect and Churned merchants.
UPDATE "Merchant" AS m
SET "status" = 'ACTIVE', "updatedAt" = NOW()
WHERE m."status" <> 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "Deal" AS d
    WHERE d."merchantId" = m."id" AND d."stage" = 'WON'
  );
