-- Move existing record tasks (Activity rows of type TASK) into the new Task
-- table so they show in the tracker. Entity links are carried over only when
-- the referenced record still exists (Activity has no FK to its entity).
INSERT INTO "Task" (
  "id", "title", "notes", "status", "priority", "dueAt", "position",
  "completedAt", "assigneeId", "createdById", "merchantId", "contactId",
  "dealId", "createdAt", "updatedAt"
)
SELECT
  a."id",
  a."subject",
  a."body",
  (CASE WHEN a."completedAt" IS NOT NULL THEN 'DONE' ELSE 'TODO' END)::"TaskStatus",
  'MEDIUM'::"TaskPriority",
  a."dueAt",
  0,
  a."completedAt",
  a."ownerId",
  a."ownerId",
  (CASE WHEN a."entityType" = 'MERCHANT'
        AND EXISTS (SELECT 1 FROM "Merchant" m WHERE m."id" = a."entityId")
        THEN a."entityId" END),
  (CASE WHEN a."entityType" = 'CONTACT'
        AND EXISTS (SELECT 1 FROM "Contact" c WHERE c."id" = a."entityId")
        THEN a."entityId" END),
  (CASE WHEN a."entityType" = 'DEAL'
        AND EXISTS (SELECT 1 FROM "Deal" d WHERE d."id" = a."entityId")
        THEN a."entityId" END),
  a."createdAt",
  a."updatedAt"
FROM "Activity" a
WHERE a."type" = 'TASK';

-- Remove the migrated tasks from the timeline so they aren't duplicated.
DELETE FROM "Activity" WHERE "type" = 'TASK';
