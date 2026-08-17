-- The dev-ticket group feed, set from inside Telegram with /devhere.
CREATE TABLE "TelegramDevFeed" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatTitle" TEXT,
    "enabledById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramDevFeed_pkey" PRIMARY KEY ("id")
);
