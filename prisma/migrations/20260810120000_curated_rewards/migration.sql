-- Curated rewards: an admin-maintained library of reward ideas plus
-- per-merchant curated instances. CRM-only; nothing syncs to the portal.

CREATE TYPE "RewardMechanic" AS ENUM ('STAMP_CARD', 'DISCOUNT', 'FREE_ITEM', 'TIME_LIMITED');
CREATE TYPE "CuratedRewardStatus" AS ENUM ('IDEA', 'PITCHED', 'ACCEPTED', 'DECLINED');

CREATE TABLE "RewardTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mechanic" "RewardMechanic" NOT NULL,
    "category" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RewardTemplate_category_idx" ON "RewardTemplate"("category");

CREATE TABLE "CuratedReward" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mechanic" "RewardMechanic" NOT NULL,
    "status" "CuratedRewardStatus" NOT NULL DEFAULT 'IDEA',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuratedReward_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CuratedReward_merchantId_idx" ON "CuratedReward"("merchantId");
CREATE INDEX "CuratedReward_templateId_idx" ON "CuratedReward"("templateId");

ALTER TABLE "CuratedReward" ADD CONSTRAINT "CuratedReward_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CuratedReward" ADD CONSTRAINT "CuratedReward_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "RewardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CuratedReward" ADD CONSTRAINT "CuratedReward_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
