-- CreateEnum
CREATE TYPE "TelegramPendingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TelegramPendingMeeting" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 30,
    "status" "TelegramPendingStatus" NOT NULL DEFAULT 'PENDING',
    "meetingId" TEXT,
    "confirmationMessageId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPendingMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramPendingMeeting_status_createdAt_idx" ON "TelegramPendingMeeting"("status", "createdAt");
