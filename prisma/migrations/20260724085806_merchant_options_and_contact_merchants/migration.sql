-- CreateEnum
CREATE TYPE "OptionSetKey" AS ENUM ('MERCHANT_CATEGORY', 'SUBSCRIPTION_PLAN');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "branches" INTEGER,
ADD COLUMN     "subscriptionPlan" TEXT;

-- CreateTable
CREATE TABLE "ContactMerchant" (
    "contactId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMerchant_pkey" PRIMARY KEY ("contactId","merchantId")
);

-- CreateTable
CREATE TABLE "OptionItem" (
    "id" TEXT NOT NULL,
    "setKey" "OptionSetKey" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMerchant_merchantId_idx" ON "ContactMerchant"("merchantId");

-- CreateIndex
CREATE INDEX "ContactMerchant_contactId_idx" ON "ContactMerchant"("contactId");

-- CreateIndex
CREATE INDEX "OptionItem_setKey_idx" ON "OptionItem"("setKey");

-- CreateIndex
CREATE UNIQUE INDEX "OptionItem_setKey_label_key" ON "OptionItem"("setKey", "label");

-- AddForeignKey
ALTER TABLE "ContactMerchant" ADD CONSTRAINT "ContactMerchant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMerchant" ADD CONSTRAINT "ContactMerchant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing contact is tagged to its current home merchant.
INSERT INTO "ContactMerchant" ("contactId", "merchantId", "createdAt")
SELECT "id", "merchantId", CURRENT_TIMESTAMP FROM "Contact"
ON CONFLICT DO NOTHING;

-- Seed default option-set values (admins can edit these in Settings).
INSERT INTO "OptionItem" ("id", "setKey", "label", "sortOrder", "archived", "createdAt")
VALUES
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Restaurants & Cafés', 0, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Retail & Shops', 1, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Grocery & Supermarket', 2, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Hospitality & Resorts', 3, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Health & Beauty', 4, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Fashion & Apparel', 5, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Electronics', 6, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Services', 7, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Entertainment & Leisure', 8, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MERCHANT_CATEGORY', 'Other', 9, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SUBSCRIPTION_PLAN', 'Starter', 0, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SUBSCRIPTION_PLAN', 'Growth', 1, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SUBSCRIPTION_PLAN', 'Enterprise', 2, false, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
