-- CreateTable
CREATE TABLE "TelegramMessageRef" (
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramMessageRef_pkey" PRIMARY KEY ("chatId","messageId")
);

-- CreateTable
CREATE TABLE "TelegramUserLink" (
    "telegramUserId" TEXT NOT NULL,
    "crmUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUserLink_pkey" PRIMARY KEY ("telegramUserId")
);
