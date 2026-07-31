-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Meeting_status_reminderSentAt_startAt_idx" ON "Meeting"("status", "reminderSentAt", "startAt");
