-- Roadmap: the idea's story from suggestion to shipped. Work status rolls up
-- from linked DevTickets rather than being tracked twice.

CREATE TYPE "RoadmapStage" AS ENUM ('SUGGESTED', 'CONSIDERING', 'PLANNED', 'IN_DEVELOPMENT', 'SHIPPED', 'DECLINED');
CREATE TYPE "RoadmapScore" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "RoadmapItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stage" "RoadmapStage" NOT NULL DEFAULT 'SUGGESTED',
    "product" "DevProduct" NOT NULL,
    "effort" "RoadmapScore",
    "impact" "RoadmapScore",
    "suggestedById" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoadmapItem_stage_idx" ON "RoadmapItem"("stage");
CREATE INDEX "RoadmapItem_product_idx" ON "RoadmapItem"("product");

CREATE TABLE "RoadmapVote" (
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapVote_pkey" PRIMARY KEY ("itemId", "userId")
);

CREATE TABLE "RoadmapDemand" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "note" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapDemand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoadmapDemand_itemId_merchantId_key" ON "RoadmapDemand"("itemId", "merchantId");
CREATE INDEX "RoadmapDemand_merchantId_idx" ON "RoadmapDemand"("merchantId");

CREATE TABLE "RoadmapComment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoadmapComment_itemId_idx" ON "RoadmapComment"("itemId");

ALTER TABLE "DevTicket" ADD COLUMN "roadmapItemId" TEXT;
CREATE INDEX "DevTicket_roadmapItemId_idx" ON "DevTicket"("roadmapItemId");

ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_suggestedById_fkey"
    FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoadmapVote" ADD CONSTRAINT "RoadmapVote_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "RoadmapItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapVote" ADD CONSTRAINT "RoadmapVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapDemand" ADD CONSTRAINT "RoadmapDemand_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "RoadmapItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapDemand" ADD CONSTRAINT "RoadmapDemand_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapComment" ADD CONSTRAINT "RoadmapComment_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "RoadmapItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapComment" ADD CONSTRAINT "RoadmapComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevTicket" ADD CONSTRAINT "DevTicket_roadmapItemId_fkey"
    FOREIGN KEY ("roadmapItemId") REFERENCES "RoadmapItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
