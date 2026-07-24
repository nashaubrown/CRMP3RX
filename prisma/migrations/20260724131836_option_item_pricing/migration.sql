-- AlterTable
ALTER TABLE "OptionItem" ADD COLUMN     "perLocation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceMvr" INTEGER;

-- Seed the current Perx plan prices (admins can change these in Settings).
UPDATE "OptionItem" SET "priceMvr" = 599,  "perLocation" = false
  WHERE "setKey" = 'SUBSCRIPTION_PLAN' AND "label" = 'Starter';
UPDATE "OptionItem" SET "priceMvr" = 799,  "perLocation" = false
  WHERE "setKey" = 'SUBSCRIPTION_PLAN' AND "label" = 'Growth';
UPDATE "OptionItem" SET "priceMvr" = 1000, "perLocation" = true
  WHERE "setKey" = 'SUBSCRIPTION_PLAN' AND "label" = 'Enterprise';
