-- Merchant onboarding: playbooks, projects, stages and tasks.

CREATE TYPE "OnboardingStageKey" AS ENUM ('PAPERWORK', 'ACCOUNT', 'INTEGRATION', 'REWARDS', 'TRAINING', 'GO_LIVE', 'POST_LAUNCH');
CREATE TYPE "OnboardingProjectStatus" AS ENUM ('ACTIVE', 'DONE', 'CANCELLED');
CREATE TYPE "OnboardingStageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED');
CREATE TYPE "OnboardingOwnerRole" AS ENUM ('REP', 'DEVELOPER', 'MERCHANT');
CREATE TYPE "OnboardingTaskSource" AS ENUM ('PLAYBOOK', 'CUSTOM');

CREATE TABLE "OnboardingPlaybook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "planLabel" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingPlaybook_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingPlaybook_name_key" ON "OnboardingPlaybook"("name");

CREATE TABLE "OnboardingPlaybookTask" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "stage" "OnboardingStageKey" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "ownerRole" "OnboardingOwnerRole" NOT NULL DEFAULT 'REP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingPlaybookTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OnboardingPlaybookTask_playbookId_stage_idx" ON "OnboardingPlaybookTask"("playbookId", "stage");
ALTER TABLE "OnboardingPlaybookTask" ADD CONSTRAINT "OnboardingPlaybookTask_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "OnboardingPlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnboardingProject" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "dealId" TEXT,
    "playbookId" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" "OnboardingProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStage" "OnboardingStageKey" NOT NULL DEFAULT 'PAPERWORK',
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetLiveDate" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingProject_merchantId_key" ON "OnboardingProject"("merchantId");
CREATE UNIQUE INDEX "OnboardingProject_dealId_key" ON "OnboardingProject"("dealId");
CREATE INDEX "OnboardingProject_status_currentStage_idx" ON "OnboardingProject"("status", "currentStage");
CREATE INDEX "OnboardingProject_ownerId_idx" ON "OnboardingProject"("ownerId");
CREATE INDEX "OnboardingProject_targetLiveDate_idx" ON "OnboardingProject"("targetLiveDate");
ALTER TABLE "OnboardingProject" ADD CONSTRAINT "OnboardingProject_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingProject" ADD CONSTRAINT "OnboardingProject_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnboardingProject" ADD CONSTRAINT "OnboardingProject_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "OnboardingPlaybook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnboardingProject" ADD CONSTRAINT "OnboardingProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnboardingProject" ADD CONSTRAINT "OnboardingProject_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OnboardingStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "OnboardingStageKey" NOT NULL,
    "status" "OnboardingStageStatus" NOT NULL DEFAULT 'PENDING',
    "enteredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    CONSTRAINT "OnboardingStage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingStage_projectId_stage_key" ON "OnboardingStage"("projectId", "stage");
CREATE INDEX "OnboardingStage_projectId_idx" ON "OnboardingStage"("projectId");
ALTER TABLE "OnboardingStage" ADD CONSTRAINT "OnboardingStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OnboardingProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "OnboardingStageKey" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "source" "OnboardingTaskSource" NOT NULL DEFAULT 'PLAYBOOK',
    "ownerRole" "OnboardingOwnerRole" NOT NULL DEFAULT 'REP',
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "devTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OnboardingTask_projectId_stage_idx" ON "OnboardingTask"("projectId", "stage");
CREATE INDEX "OnboardingTask_assigneeId_idx" ON "OnboardingTask"("assigneeId");
CREATE INDEX "OnboardingTask_dueAt_idx" ON "OnboardingTask"("dueAt");
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OnboardingProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_devTicketId_fkey" FOREIGN KEY ("devTicketId") REFERENCES "DevTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
