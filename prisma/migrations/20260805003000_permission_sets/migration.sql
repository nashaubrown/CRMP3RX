-- Named capability sets for sales reps. Admins bypass these entirely.

CREATE TABLE "PermissionSet" (
  "id"                 TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "description"        TEXT,
  "canExportData"      BOOLEAN NOT NULL DEFAULT false,
  "canSeeAllMerchants" BOOLEAN NOT NULL DEFAULT true,
  "canSeeTeamNumbers"  BOOLEAN NOT NULL DEFAULT true,
  "isDefault"          BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PermissionSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermissionSet_name_key" ON "PermissionSet"("name");
CREATE INDEX "PermissionSet_isDefault_idx" ON "PermissionSet"("isDefault");

ALTER TABLE "User" ADD COLUMN "permissionSetId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_permissionSetId_fkey"
  FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Two starting sets.
--
-- "Sales rep" is the default and deliberately preserves today's behaviour in
-- every respect but one: bulk CSV export was previously ungated for everyone,
-- so it starts off. Nobody's day-to-day access changes when this ships.
INSERT INTO "PermissionSet"
  ("id","name","description","canExportData","canSeeAllMerchants","canSeeTeamNumbers","isDefault","createdAt","updatedAt")
VALUES
  ('ps_sales_rep','Sales rep',
   'Sees the whole team''s merchants and dashboard totals. Cannot bulk-download data.',
   false, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ps_own_book','Own book only',
   'Sees only their own merchants and no team-wide numbers. Cannot bulk-download data.',
   false, false, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
