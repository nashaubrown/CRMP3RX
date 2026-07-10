-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "merchantId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_merchantId_createdAt_idx" ON "AuditLog"("merchantId", "createdAt");
