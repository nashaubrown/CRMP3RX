-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'EDIT');

-- CreateTable
CREATE TABLE "MerchantShare" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantShare_userId_idx" ON "MerchantShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantShare_merchantId_userId_key" ON "MerchantShare"("merchantId", "userId");

-- AddForeignKey
ALTER TABLE "MerchantShare" ADD CONSTRAINT "MerchantShare_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantShare" ADD CONSTRAINT "MerchantShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
