-- The single "owner" account: the only one allowed to reset another admin's
-- password, or disable/demote another admin.
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- Seed the owner as the earliest-created admin, so the system is never left
-- with no one able to recover an admin account.
UPDATE "User"
SET "isOwner" = true
WHERE id = (
  SELECT id FROM "User"
  WHERE role = 'ADMIN' AND "disabledAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1
);
