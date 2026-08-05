-- Affiliate portal: self-registration (KYC + signed T&C), portal auth
-- (magic links + sessions), payout schedule, bank details, lead attribution.
--
-- Legacy admin-created affiliates are backfilled to APPROVED with their
-- email treated as verified at creation, so they can sign in to the portal
-- immediately (the portal then prompts them to complete bank details and
-- sign the current terms).

-- Enums
CREATE TYPE "AffiliateApplicationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "PayoutSchedule" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "AffiliateTokenPurpose" AS ENUM ('LOGIN', 'REGISTER_EMAIL', 'DRAFT', 'BANK_CHANGE', 'APPLICATION_STATUS');
CREATE TYPE "AffiliateFileKind" AS ENUM ('ID_DOCUMENT', 'SIGNATURE');

-- Affiliate: application / KYC / bank / agreement / payout / portal fields
ALTER TABLE "Affiliate"
  ADD COLUMN "applicationStatus" "AffiliateApplicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "appliedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "idCardNumber" TEXT,
  ADD COLUMN "idDocumentKey" TEXT,
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "bankAccountNoEnc" TEXT,
  ADD COLUMN "bankAccountLast4" TEXT,
  ADD COLUMN "tcVersion" TEXT,
  ADD COLUMN "tcAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "tcAcceptedIp" TEXT,
  ADD COLUMN "tcAcceptedUa" TEXT,
  ADD COLUMN "signatureKey" TEXT,
  ADD COLUMN "payoutSchedule" "PayoutSchedule" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastPortalLoginAt" TIMESTAMP(3);

-- Backfill: every pre-portal affiliate was created (and vetted) by staff.
UPDATE "Affiliate"
SET "applicationStatus" = 'APPROVED',
    "emailVerifiedAt" = "createdAt";

CREATE INDEX "Affiliate_applicationStatus_idx" ON "Affiliate"("applicationStatus");

-- One-time portal tokens (hashes only)
CREATE TABLE "AffiliateLoginToken" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "purpose" "AffiliateTokenPurpose" NOT NULL DEFAULT 'LOGIN',
  "hashedToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateLoginToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateLoginToken_hashedToken_key" ON "AffiliateLoginToken"("hashedToken");
CREATE INDEX "AffiliateLoginToken_affiliateId_idx" ON "AffiliateLoginToken"("affiliateId");
CREATE INDEX "AffiliateLoginToken_expiresAt_idx" ON "AffiliateLoginToken"("expiresAt");

ALTER TABLE "AffiliateLoginToken"
  ADD CONSTRAINT "AffiliateLoginToken_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Portal sessions (30-day sliding)
CREATE TABLE "AffiliateSession" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "hashedToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateSession_hashedToken_key" ON "AffiliateSession"("hashedToken");
CREATE INDEX "AffiliateSession_affiliateId_idx" ON "AffiliateSession"("affiliateId");
CREATE INDEX "AffiliateSession_expiresAt_idx" ON "AffiliateSession"("expiresAt");

ALTER TABLE "AffiliateSession"
  ADD CONSTRAINT "AffiliateSession_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Private registration uploads (ID document, drawn signature)
CREATE TABLE "AffiliateFile" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "kind" "AffiliateFileKind" NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "tcVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AffiliateFile_affiliateId_idx" ON "AffiliateFile"("affiliateId");

ALTER TABLE "AffiliateFile"
  ADD CONSTRAINT "AffiliateFile_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Singleton T&C setting
CREATE TABLE "AffiliateTermsSetting" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffiliateTermsSetting_pkey" PRIMARY KEY ("id")
);

-- Lead attribution
ALTER TABLE "Lead" ADD COLUMN "affiliateId" TEXT;
CREATE INDEX "Lead_affiliateId_idx" ON "Lead"("affiliateId");
ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
