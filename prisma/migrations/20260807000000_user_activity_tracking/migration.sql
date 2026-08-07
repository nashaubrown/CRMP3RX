-- Adoption tracking for CRM users. Sessions are JWT, so nothing was ever
-- written to the Session table and there was no way to tell who had signed in.
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- Seed lastActiveAt from the audit trail so the Team page is useful on day one
-- rather than showing "never" for everybody.
UPDATE "User" u
SET "lastActiveAt" = a.last_at
FROM (
  SELECT "actorId", MAX("createdAt") AS last_at
  FROM "AuditLog"
  WHERE "actorId" IS NOT NULL
  GROUP BY "actorId"
) a
WHERE u.id = a."actorId";
