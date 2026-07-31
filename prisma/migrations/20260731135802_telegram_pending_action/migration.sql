-- CreateEnum
CREATE TYPE "TelegramActionKind" AS ENUM ('MERCHANT', 'CONTACT');

-- CreateTable
CREATE TABLE "TelegramPendingAction" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "kind" "TelegramActionKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "TelegramPendingStatus" NOT NULL DEFAULT 'PENDING',
    "recordId" TEXT,
    "confirmationMessageId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramPendingAction_status_createdAt_idx" ON "TelegramPendingAction"("status", "createdAt");
