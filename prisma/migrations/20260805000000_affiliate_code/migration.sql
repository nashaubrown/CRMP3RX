-- Permanent public referral code for each affiliate.
--
-- Added nullable first so existing rows can be backfilled in the same
-- transaction, then tightened to NOT NULL + UNIQUE. The alphabet matches
-- src/lib/affiliate-code.ts (no 0/O, 1/I/L or U/V).

ALTER TABLE "Affiliate" ADD COLUMN "code" TEXT;

DO $$
DECLARE
  target RECORD;
  alphabet TEXT := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate TEXT;
  i INT;
BEGIN
  FOR target IN SELECT id FROM "Affiliate" WHERE "code" IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..6 LOOP
        candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
      END LOOP;
      -- Retry on the astronomically unlikely collision.
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Affiliate" WHERE "code" = candidate);
    END LOOP;
    UPDATE "Affiliate" SET "code" = candidate WHERE id = target.id;
  END LOOP;
END $$;

ALTER TABLE "Affiliate" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");
