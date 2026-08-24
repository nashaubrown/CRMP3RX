import type {
  OnboardingOwnerRole,
  OnboardingProject,
  OnboardingStageKey,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { audit } from "@/services/audit";
import { ONBOARDING_STAGES, nextStage } from "@/lib/onboarding-stages";
import { DEFAULT_PLAYBOOKS } from "@/services/onboarding-playbooks";

export class OnboardingError extends Error {}

export {
  ONBOARDING_STAGES,
  STAGE_LABELS,
  OWNER_ROLE_LABELS,
  stageIndex,
} from "@/lib/onboarding-stages";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

// ---------- playbooks ----------

// Seeds the three default playbooks the first time onboarding is used, and
// tops up any that were deleted. Idempotent by name, so it can run on every
// board load without accumulating duplicates.
export async function ensureDefaultPlaybooks(): Promise<void> {
  const existing = await db.onboardingPlaybook.findMany({ select: { name: true } });
  const have = new Set(existing.map((p) => p.name));
  const missing = DEFAULT_PLAYBOOKS.filter((p) => !have.has(p.name));
  if (missing.length === 0) return;

  for (const playbook of missing) {
    await db.onboardingPlaybook.create({
      data: {
        name: playbook.name,
        description: playbook.description,
        planLabel: playbook.planLabel,
        isDefault: playbook.isDefault ?? false,
        tasks: {
          create: playbook.tasks.map((t, i) => ({
            stage: t.stage,
            title: t.title,
            description: t.description ?? null,
            position: i,
            dueOffsetDays: t.dueOffsetDays ?? 0,
            ownerRole: t.ownerRole ?? "REP",
          })),
        },
      },
    });
  }
}

// Picks the playbook for a merchant: an exact plan match first (Merchant
// .subscriptionPlan is a free-text option-set label), then the default.
export async function playbookForPlan(plan: string | null | undefined) {
  const playbooks = await db.onboardingPlaybook.findMany({
    where: { archivedAt: null },
    include: { tasks: { orderBy: [{ stage: "asc" }, { position: "asc" }] } },
  });
  if (playbooks.length === 0) return null;
  const normalized = plan?.trim().toLowerCase();
  const byPlan = normalized
    ? playbooks.find((p) => p.planLabel?.trim().toLowerCase() === normalized)
    : undefined;
  return byPlan ?? playbooks.find((p) => p.isDefault) ?? playbooks[0];
}

// ---------- projects ----------

export type StartOnboardingInput = {
  merchantId: string;
  dealId?: string | null;
  ownerId?: string | null;
  targetLiveDate?: Date | null;
  playbookId?: string | null;
};

export async function startOnboarding(
  ctx: SessionUser,
  input: StartOnboardingInput
): Promise<OnboardingProject> {
  const merchant = await db.merchant.findUnique({
    where: { id: input.merchantId },
    select: { id: true, name: true, ownerId: true, subscriptionPlan: true },
  });
  if (!merchant) throw new OnboardingError("Merchant not found.");

  const already = await db.onboardingProject.findUnique({
    where: { merchantId: merchant.id },
    select: { id: true },
  });
  if (already) throw new OnboardingError("This merchant already has an onboarding project.");

  await ensureDefaultPlaybooks();
  const playbook = input.playbookId
    ? await db.onboardingPlaybook.findUnique({
        where: { id: input.playbookId },
        include: { tasks: { orderBy: [{ stage: "asc" }, { position: "asc" }] } },
      })
    : await playbookForPlan(merchant.subscriptionPlan);

  const ownerId = input.ownerId ?? merchant.ownerId ?? ctx.id;
  const now = new Date();

  const project = await db.onboardingProject.create({
    data: {
      merchantId: merchant.id,
      dealId: input.dealId ?? null,
      playbookId: playbook?.id ?? null,
      ownerId,
      currentStage: "PAPERWORK",
      stageEnteredAt: now,
      targetLiveDate: input.targetLiveDate ?? null,
      stages: {
        create: ONBOARDING_STAGES.map((stage) => ({
          stage,
          status: stage === "PAPERWORK" ? "IN_PROGRESS" : "PENDING",
          enteredAt: stage === "PAPERWORK" ? now : null,
        })),
      },
      tasks: playbook
        ? {
            create: playbook.tasks.map((t) => ({
              stage: t.stage,
              title: t.title,
              description: t.description,
              position: t.position,
              ownerRole: t.ownerRole,
              source: "PLAYBOOK" as const,
              // Only the first stage is live, so only its steps get real due
              // dates; the rest are dated when their stage is entered.
              dueAt:
                t.stage === "PAPERWORK"
                  ? new Date(now.getTime() + t.dueOffsetDays * DAY_MS)
                  : null,
              assigneeId: t.ownerRole === "REP" ? ownerId : null,
            })),
          }
        : undefined,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "onboarding.start",
    entityType: "OnboardingProject",
    entityId: project.id,
    merchantId: merchant.id,
    diff: { playbook: playbook?.name ?? null, owner: ownerId },
  });

  return project;
}

// Called when a deal is won. Best-effort by contract: a merchant who already
// has a project, or a race between two "Won" clicks, must never fail the deal
// update that triggered it.
export async function startOnboardingForWonDeal(
  ctx: SessionUser,
  dealId: string
): Promise<OnboardingProject | null> {
  try {
    const deal = await db.deal.findUnique({
      where: { id: dealId },
      select: { id: true, merchantId: true, ownerId: true },
    });
    if (!deal) return null;
    const existing = await db.onboardingProject.findUnique({
      where: { merchantId: deal.merchantId },
      select: { id: true },
    });
    if (existing) return null;
    return await startOnboarding(ctx, {
      merchantId: deal.merchantId,
      dealId: deal.id,
      ownerId: deal.ownerId,
    });
  } catch (e) {
    console.error("[onboarding] auto-start failed", e);
    return null;
  }
}

const projectInclude = {
  merchant: {
    select: {
      id: true,
      name: true,
      category: true,
      subscriptionPlan: true,
      branches: true,
      status: true,
    },
  },
  owner: { select: { id: true, name: true } },
  playbook: { select: { id: true, name: true } },
  deal: { select: { id: true, title: true, value: true, currency: true } },
  stages: true,
  tasks: {
    orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
    include: {
      assignee: { select: { id: true, name: true } },
      devTicket: { select: { id: true, number: true, title: true, status: true } },
    },
  },
} satisfies Prisma.OnboardingProjectInclude;

export type ProjectWithRelations = Prisma.OnboardingProjectGetPayload<{
  include: typeof projectInclude;
}>;

export type ProjectCard = {
  id: string;
  merchantId: string;
  merchantName: string;
  plan: string | null;
  branches: number | null;
  ownerName: string | null;
  stage: OnboardingStageKey;
  status: ProjectWithRelations["status"];
  daysInStage: number;
  daysInFlight: number;
  tasksDone: number;
  tasksTotal: number;
  stageTasksDone: number;
  stageTasksTotal: number;
  blockedReason: string | null;
  blockedDays: number | null;
  overdueTasks: number;
  targetLiveDate: Date | null;
  liveAt: Date | null;
  /** Which stages are already behind this project — drives the progress rail. */
  completedStages: OnboardingStageKey[];
};

export function toCard(p: ProjectWithRelations, now = new Date()): ProjectCard {
  const stageTasks = p.tasks.filter((t) => t.stage === p.currentStage);
  return {
    id: p.id,
    merchantId: p.merchantId,
    merchantName: p.merchant.name,
    plan: p.merchant.subscriptionPlan,
    branches: p.merchant.branches,
    ownerName: p.owner?.name ?? null,
    stage: p.currentStage,
    status: p.status,
    daysInStage: daysBetween(p.stageEnteredAt, now),
    daysInFlight: daysBetween(p.startedAt, now),
    tasksDone: p.tasks.filter((t) => t.doneAt).length,
    tasksTotal: p.tasks.length,
    stageTasksDone: stageTasks.filter((t) => t.doneAt).length,
    stageTasksTotal: stageTasks.length,
    blockedReason: p.blockedReason,
    blockedDays: p.blockedAt ? daysBetween(p.blockedAt, now) : null,
    overdueTasks: p.tasks.filter((t) => !t.doneAt && t.dueAt && t.dueAt < now).length,
    targetLiveDate: p.targetLiveDate,
    liveAt: p.liveAt,
    completedStages: p.stages
      .filter((s) => s.status === "DONE" || s.status === "SKIPPED")
      .map((s) => s.stage),
  };
}

export async function listOnboarding(options?: {
  ownerId?: string | null;
  includeFinished?: boolean;
}): Promise<ProjectCard[]> {
  const projects = await db.onboardingProject.findMany({
    where: {
      ...(options?.ownerId ? { ownerId: options.ownerId } : {}),
      ...(options?.includeFinished ? {} : { status: "ACTIVE" }),
    },
    include: projectInclude,
    orderBy: [{ stageEnteredAt: "asc" }],
  });
  const now = new Date();
  return projects.map((p) => toCard(p, now));
}

export async function getOnboardingProject(id: string) {
  return db.onboardingProject.findUnique({ where: { id }, include: projectInclude });
}

export async function getOnboardingForMerchant(merchantId: string) {
  return db.onboardingProject.findUnique({ where: { merchantId }, include: projectInclude });
}

// ---------- portfolio metrics ----------

export type OnboardingMetrics = {
  inFlight: number;
  blocked: number;
  goingLiveSoon: number;
  medianDaysToLive: number | null;
};

export async function onboardingMetrics(): Promise<OnboardingMetrics> {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * DAY_MS);
  const [active, live] = await Promise.all([
    db.onboardingProject.findMany({
      where: { status: "ACTIVE" },
      select: { blockedAt: true, targetLiveDate: true },
    }),
    db.onboardingProject.findMany({
      where: { liveAt: { not: null } },
      select: { startedAt: true, liveAt: true },
      orderBy: { liveAt: "desc" },
      take: 50,
    }),
  ]);

  const spans = live
    .map((p) => daysBetween(p.startedAt, p.liveAt as Date))
    .sort((a, b) => a - b);
  const median =
    spans.length === 0
      ? null
      : spans.length % 2 === 1
        ? spans[(spans.length - 1) / 2]
        : Math.round((spans[spans.length / 2 - 1] + spans[spans.length / 2]) / 2);

  return {
    inFlight: active.length,
    blocked: active.filter((p) => p.blockedAt).length,
    goingLiveSoon: active.filter((p) => p.targetLiveDate && p.targetLiveDate <= soon).length,
    medianDaysToLive: median,
  };
}

// ---------- mutations ----------

async function loadForWrite(projectId: string) {
  const project = await db.onboardingProject.findUnique({
    where: { id: projectId },
    select: { id: true, merchantId: true, ownerId: true, currentStage: true, status: true },
  });
  if (!project) throw new OnboardingError("Onboarding project not found.");
  // Onboarding is team work — a colleague covering a launch must be able to
  // tick a step — so any signed-in user may edit. Ownership still drives the
  // "mine" filter and the audit trail records who did what.
  return project;
}

export async function setTaskDone(ctx: SessionUser, taskId: string, done: boolean) {
  const task = await db.onboardingTask.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, title: true, doneAt: true },
  });
  if (!task) throw new OnboardingError("Step not found.");
  const project = await loadForWrite(task.projectId);

  await db.onboardingTask.update({
    where: { id: task.id },
    data: {
      doneAt: done ? new Date() : null,
      doneById: done ? ctx.id : null,
    },
  });

  await audit({
    actorId: ctx.id,
    action: done ? "onboarding.task_done" : "onboarding.task_reopen",
    entityType: "OnboardingTask",
    entityId: task.id,
    merchantId: project.merchantId,
    diff: { title: task.title },
  });
}

export type AddTaskInput = {
  stage: OnboardingStageKey;
  title: string;
  description?: string | null;
  ownerRole?: OnboardingOwnerRole;
  assigneeId?: string | null;
  dueAt?: Date | null;
};

export async function addProjectTask(
  ctx: SessionUser,
  projectId: string,
  input: AddTaskInput
) {
  const title = input.title.trim();
  if (!title) throw new OnboardingError("Give the step a name.");
  const project = await loadForWrite(projectId);

  const last = await db.onboardingTask.findFirst({
    where: { projectId, stage: input.stage },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const task = await db.onboardingTask.create({
    data: {
      projectId,
      stage: input.stage,
      title,
      description: input.description?.trim() || null,
      ownerRole: input.ownerRole ?? "REP",
      assigneeId: input.assigneeId ?? null,
      dueAt: input.dueAt ?? null,
      position: (last?.position ?? -1) + 1,
      // Added for this merchant only: the playbook is untouched, which is the
      // whole point of allowing it.
      source: "CUSTOM",
    },
  });

  await audit({
    actorId: ctx.id,
    action: "onboarding.task_add",
    entityType: "OnboardingTask",
    entityId: task.id,
    merchantId: project.merchantId,
    diff: { title, stage: input.stage },
  });

  return task;
}

export async function removeProjectTask(ctx: SessionUser, taskId: string) {
  const task = await db.onboardingTask.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, title: true, source: true },
  });
  if (!task) throw new OnboardingError("Step not found.");
  const project = await loadForWrite(task.projectId);

  await db.onboardingTask.delete({ where: { id: task.id } });
  await audit({
    actorId: ctx.id,
    action: "onboarding.task_remove",
    entityType: "OnboardingTask",
    entityId: task.id,
    merchantId: project.merchantId,
    diff: { title: task.title },
  });
}

// Moves the project into its next stage. `skipReason` marks the stage being
// left as skipped rather than done — an outlet with no POS never integrates,
// and pretending otherwise corrupts the cycle-time numbers.
export async function advanceStage(
  ctx: SessionUser,
  projectId: string,
  skipReason?: string | null
) {
  const project = await loadForWrite(projectId);
  if (project.status !== "ACTIVE") throw new OnboardingError("This onboarding is finished.");

  const from = project.currentStage;
  const to = nextStage(from);
  const now = new Date();
  const reason = skipReason?.trim() || null;

  await db.onboardingStage.updateMany({
    where: { projectId, stage: from },
    data: {
      status: reason ? "SKIPPED" : "DONE",
      completedAt: now,
      skipReason: reason,
    },
  });

  if (!to) {
    // Past post-launch: the project is done.
    await db.onboardingProject.update({
      where: { id: projectId },
      data: { status: "DONE", completedAt: now, blockedReason: null, blockedAt: null },
    });
  } else {
    await db.$transaction([
      db.onboardingStage.updateMany({
        where: { projectId, stage: to },
        data: { status: "IN_PROGRESS", enteredAt: now },
      }),
      db.onboardingProject.update({
        where: { id: projectId },
        data: {
          currentStage: to,
          stageEnteredAt: now,
          // Entering a stage un-blocks it: whatever was in the way belonged to
          // the stage just left.
          blockedReason: null,
          blockedAt: null,
          blockedById: null,
          ...(from === "GO_LIVE" ? { liveAt: now } : {}),
        },
      }),
    ]);

    // Date this stage's steps now that it has actually started.
    await dateStageTasks(projectId, to, now);

    if (from === "GO_LIVE") {
      // The merchant is live in the real world; the CRM should say so.
      await db.merchant.update({
        where: { id: project.merchantId },
        data: { status: "ACTIVE", loyaltyLive: true },
      });
    }
  }

  await audit({
    actorId: ctx.id,
    action: reason ? "onboarding.stage_skip" : "onboarding.stage_advance",
    entityType: "OnboardingProject",
    entityId: projectId,
    merchantId: project.merchantId,
    diff: { from, to: to ?? "DONE", reason },
  });
}

// Due dates are offsets from the moment a stage starts, so they're written
// when the stage is entered rather than guessed at project creation.
async function dateStageTasks(projectId: string, stage: OnboardingStageKey, from: Date) {
  const project = await db.onboardingProject.findUnique({
    where: { id: projectId },
    select: { playbookId: true, ownerId: true },
  });
  if (!project?.playbookId) return;

  const templates = await db.onboardingPlaybookTask.findMany({
    where: { playbookId: project.playbookId, stage },
    select: { title: true, dueOffsetDays: true },
  });
  const offsets = new Map(templates.map((t) => [t.title, t.dueOffsetDays]));

  const tasks = await db.onboardingTask.findMany({
    where: { projectId, stage, dueAt: null, doneAt: null },
    select: { id: true, title: true },
  });

  await Promise.all(
    tasks.map((t) =>
      db.onboardingTask.update({
        where: { id: t.id },
        data: { dueAt: new Date(from.getTime() + (offsets.get(t.title) ?? 0) * DAY_MS) },
      })
    )
  );
}

export async function setBlocked(
  ctx: SessionUser,
  projectId: string,
  reason: string | null
) {
  const project = await loadForWrite(projectId);
  const trimmed = reason?.trim() || null;

  await db.onboardingProject.update({
    where: { id: projectId },
    data: {
      blockedReason: trimmed,
      blockedAt: trimmed ? new Date() : null,
      blockedById: trimmed ? ctx.id : null,
    },
  });

  await audit({
    actorId: ctx.id,
    action: trimmed ? "onboarding.block" : "onboarding.unblock",
    entityType: "OnboardingProject",
    entityId: projectId,
    merchantId: project.merchantId,
    diff: { reason: trimmed },
  });
}

export async function setProjectFields(
  ctx: SessionUser,
  projectId: string,
  fields: { ownerId?: string; targetLiveDate?: Date | null }
) {
  const project = await loadForWrite(projectId);
  if (fields.ownerId && !isAdmin(ctx) && project.ownerId !== ctx.id) {
    // Reassigning someone else's launch is an admin move; everything else on
    // the project stays open to the team.
    throw new OnboardingError("Only the owner or an admin can reassign this onboarding.");
  }

  await db.onboardingProject.update({
    where: { id: projectId },
    data: {
      ...(fields.ownerId ? { ownerId: fields.ownerId } : {}),
      ...(fields.targetLiveDate !== undefined ? { targetLiveDate: fields.targetLiveDate } : {}),
    },
  });

  await audit({
    actorId: ctx.id,
    action: "onboarding.update",
    entityType: "OnboardingProject",
    entityId: projectId,
    merchantId: project.merchantId,
    diff: fields,
  });
}

export async function cancelOnboarding(ctx: SessionUser, projectId: string) {
  const project = await loadForWrite(projectId);
  if (!isAdmin(ctx) && project.ownerId !== ctx.id) {
    throw new OnboardingError("Only the owner or an admin can cancel an onboarding.");
  }
  await db.onboardingProject.update({
    where: { id: projectId },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  await audit({
    actorId: ctx.id,
    action: "onboarding.cancel",
    entityType: "OnboardingProject",
    entityId: projectId,
    merchantId: project.merchantId,
  });
}
