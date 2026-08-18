-- lastSeenAt: presence, not just the login-form moment. Backfilled from the
-- best evidence we already hold, so nobody shows "never" who demonstrably
-- was here (long-lived sessions predate sign-in tracking).
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
UPDATE "User" SET "lastSeenAt" = GREATEST(
  COALESCE("lastLoginAt", '-infinity'),
  COALESCE("lastActiveAt", '-infinity')
) WHERE "lastLoginAt" IS NOT NULL OR "lastActiveAt" IS NOT NULL;
