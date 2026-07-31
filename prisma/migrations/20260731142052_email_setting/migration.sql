-- CreateTable
CREATE TABLE "EmailSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "fromName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSetting_pkey" PRIMARY KEY ("id")
);
