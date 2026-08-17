-- Dev tickets: a Jira-shaped board inside the CRM, plus the DEVELOPER role.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEVELOPER';

CREATE TYPE "DevTicketType" AS ENUM ('BUG', 'FEATURE', 'IMPROVEMENT');
CREATE TYPE "DevProduct" AS ENUM ('MERCHANT_PORTAL', 'PERX_APP', 'CRM');
CREATE TYPE "DevTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "DevTicketStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'TESTING', 'DONE', 'WONT_DO');

CREATE TABLE "DevTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "DevTicketType" NOT NULL,
    "product" "DevProduct" NOT NULL,
    "priority" "DevTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "DevTicketStatus" NOT NULL DEFAULT 'BACKLOG',
    "position" INTEGER NOT NULL DEFAULT 0,
    "merchantId" TEXT,
    "reporterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevTicket_number_key" ON "DevTicket"("number");
CREATE INDEX "DevTicket_status_position_idx" ON "DevTicket"("status", "position");
CREATE INDEX "DevTicket_assigneeId_idx" ON "DevTicket"("assigneeId");
CREATE INDEX "DevTicket_reporterId_idx" ON "DevTicket"("reporterId");
CREATE INDEX "DevTicket_merchantId_idx" ON "DevTicket"("merchantId");

CREATE TABLE "DevTicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevTicketComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DevTicketComment_ticketId_idx" ON "DevTicketComment"("ticketId");

CREATE TABLE "DevTicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevTicketAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DevTicketAttachment_ticketId_idx" ON "DevTicketAttachment"("ticketId");

ALTER TABLE "DevTicket" ADD CONSTRAINT "DevTicket_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DevTicket" ADD CONSTRAINT "DevTicket_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevTicket" ADD CONSTRAINT "DevTicket_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DevTicketComment" ADD CONSTRAINT "DevTicketComment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "DevTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DevTicketComment" ADD CONSTRAINT "DevTicketComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevTicketAttachment" ADD CONSTRAINT "DevTicketAttachment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "DevTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
