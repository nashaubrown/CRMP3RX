
-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "meetingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Activity_meetingId_key" ON "Activity"("meetingId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

