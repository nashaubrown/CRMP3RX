import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { ONBOARDING_STAGES } from "@/lib/onboarding-stages";
import {
  addProjectTask,
  advanceStage,
  cancelOnboarding,
  ensureDefaultPlaybooks,
  getOnboardingProject,
  listOnboarding,
  onboardingMetrics,
  OnboardingError,
  removeProjectTask,
  setBlocked,
  setTaskDone,
  startOnboarding,
  startOnboardingForWonDeal,
} from "@/services/onboarding";

const suffix = `onb-${Math.random().toString(36).slice(2, 8)}`;
let admin: SessionUser;
let rep: SessionUser;
let merchantId: string;

async function makeMerchant(name: string, plan: string | null, ownerId: string) {
  const m = await db.merchant.create({
    data: { name: `${name} ${suffix}`, subscriptionPlan: plan, ownerId, branches: 2 },
  });
  return m.id;
}

beforeAll(async () => {
  const [a, r] = await Promise.all([
    db.user.create({ data: { name: "Onb Admin", email: `a-${suffix}@t.mv`, role: "ADMIN" } }),
    db.user.create({ data: { name: "Onb Rep", email: `r-${suffix}@t.mv`, role: "SALES_REP" } }),
  ]);
  admin = { id: a.id, role: "ADMIN", name: a.name };
  rep = { id: r.id, role: "SALES_REP", name: r.name };
  merchantId = await makeMerchant("Kaanaa", "Growth", rep.id);
  await ensureDefaultPlaybooks();
});

afterAll(async () => {
  const merchants = await db.merchant.findMany({
    where: { name: { contains: suffix } },
    select: { id: true },
  });
  const ids = merchants.map((m) => m.id);
  await db.onboardingProject.deleteMany({ where: { merchantId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { merchantId: { in: ids } } });
  await db.deal.deleteMany({ where: { merchantId: { in: ids } } });
  await db.merchant.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("onboarding projects", () => {
  it("seeds playbooks once, however many times it is asked", async () => {
    await ensureDefaultPlaybooks();
    await ensureDefaultPlaybooks();
    const names = await db.onboardingPlaybook.findMany({ select: { name: true } });
    expect(names.filter((n) => n.name === "Growth")).toHaveLength(1);
    expect(names.map((n) => n.name)).toEqual(
      expect.arrayContaining(["Starter", "Growth", "Enterprise"])
    );
  });

  it("starts a project on the playbook matching the merchant's plan", async () => {
    const project = await startOnboarding(rep, { merchantId });
    const full = await getOnboardingProject(project.id);

    expect(full?.playbook?.name).toBe("Growth");
    expect(full?.currentStage).toBe("PAPERWORK");
    // Every stage exists up front, so the stepper has something to draw.
    expect(full?.stages).toHaveLength(ONBOARDING_STAGES.length);
    expect(full?.stages.find((s) => s.stage === "PAPERWORK")?.status).toBe("IN_PROGRESS");
    expect(full?.stages.find((s) => s.stage === "REWARDS")?.status).toBe("PENDING");
    expect(full!.tasks.length).toBeGreaterThan(10);

    // Only the live stage is dated: a due date for a stage that hasn't begun
    // would be fiction.
    const paperwork = full!.tasks.filter((t) => t.stage === "PAPERWORK");
    const rewards = full!.tasks.filter((t) => t.stage === "REWARDS");
    expect(paperwork.every((t) => t.dueAt !== null)).toBe(true);
    expect(rewards.every((t) => t.dueAt === null)).toBe(true);
  });

  it("refuses a second project for the same merchant", async () => {
    await expect(startOnboarding(rep, { merchantId })).rejects.toThrow(OnboardingError);
  });

  it("advancing completes the stage, opens the next one and dates its steps", async () => {
    const project = await db.onboardingProject.findUniqueOrThrow({ where: { merchantId } });
    await advanceStage(rep, project.id);

    const full = await getOnboardingProject(project.id);
    expect(full?.currentStage).toBe("ACCOUNT");
    expect(full?.stages.find((s) => s.stage === "PAPERWORK")?.status).toBe("DONE");
    expect(full?.stages.find((s) => s.stage === "ACCOUNT")?.status).toBe("IN_PROGRESS");
    expect(full!.tasks.filter((t) => t.stage === "ACCOUNT").every((t) => t.dueAt)).toBe(true);
  });

  it("skipping records why, and the stage never claims to be done", async () => {
    const project = await db.onboardingProject.findUniqueOrThrow({ where: { merchantId } });
    await advanceStage(rep, project.id, "  No POS at this outlet  ");

    const stage = await db.onboardingStage.findFirstOrThrow({
      where: { projectId: project.id, stage: "ACCOUNT" },
    });
    expect(stage.status).toBe("SKIPPED");
    expect(stage.skipReason).toBe("No POS at this outlet");
  });

  it("blocking is recorded with a reason and shows on the card", async () => {
    const project = await db.onboardingProject.findUniqueOrThrow({ where: { merchantId } });
    await setBlocked(rep, project.id, "Waiting on SmartPOS credentials");

    const cards = await listOnboarding();
    const card = cards.find((c) => c.id === project.id);
    expect(card?.blockedReason).toBe("Waiting on SmartPOS credentials");
    expect(card?.blockedDays).toBe(0);

    await setBlocked(rep, project.id, null);
    const after = await db.onboardingProject.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.blockedReason).toBeNull();
    expect(after.blockedAt).toBeNull();
  });

  it("entering a stage clears a blocker that belonged to the one behind it", async () => {
    const project = await db.onboardingProject.findUniqueOrThrow({ where: { merchantId } });
    await setBlocked(rep, project.id, "Vendor silent");
    await advanceStage(rep, project.id);
    const after = await db.onboardingProject.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.blockedReason).toBeNull();
  });

  it("a step added here belongs to this merchant, not the playbook", async () => {
    const project = await db.onboardingProject.findUniqueOrThrow({ where: { merchantId } });
    const before = await db.onboardingPlaybookTask.count({
      where: { playbookId: project.playbookId! },
    });

    const task = await addProjectTask(rep, project.id, {
      stage: "REWARDS",
      title: "Print Dhivehi table talkers",
      ownerRole: "MERCHANT",
    });
    expect(task.source).toBe("CUSTOM");
    expect(
      await db.onboardingPlaybookTask.count({ where: { playbookId: project.playbookId! } })
    ).toBe(before);

    await setTaskDone(rep, task.id, true);
    expect((await db.onboardingTask.findUniqueOrThrow({ where: { id: task.id } })).doneById).toBe(
      rep.id
    );

    await removeProjectTask(rep, task.id);
    expect(await db.onboardingTask.findUnique({ where: { id: task.id } })).toBeNull();
  });

  it("passing go-live marks the merchant live in the CRM too", async () => {
    const id = await makeMerchant("Sea House", "Starter", rep.id);
    const project = await startOnboarding(rep, { merchantId: id });

    // Walk to go-live, then through it.
    for (const _ of ["PAPERWORK", "ACCOUNT", "INTEGRATION", "REWARDS", "TRAINING", "GO_LIVE"]) {
      await advanceStage(rep, project.id);
    }

    const after = await db.onboardingProject.findUniqueOrThrow({ where: { id: project.id } });
    const merchant = await db.merchant.findUniqueOrThrow({ where: { id } });
    expect(after.currentStage).toBe("POST_LAUNCH");
    expect(after.liveAt).not.toBeNull();
    expect(merchant.status).toBe("ACTIVE");
    expect(merchant.loyaltyLive).toBe(true);

    // One more advance ends the project rather than running off the end.
    await advanceStage(rep, project.id);
    const done = await db.onboardingProject.findUniqueOrThrow({ where: { id: project.id } });
    expect(done.status).toBe("DONE");
    expect(done.completedAt).not.toBeNull();
    await expect(advanceStage(rep, project.id)).rejects.toThrow(OnboardingError);
  });

  it("winning a deal starts onboarding, and winning a second one doesn't duplicate it", async () => {
    const id = await makeMerchant("Coffee Lab", "Growth", rep.id);
    const deal = await db.deal.create({
      data: {
        title: `Coffee Lab loyalty ${suffix}`,
        merchantId: id,
        ownerId: rep.id,
        value: 12000,
        stage: "WON",
      },
    });

    const started = await startOnboardingForWonDeal(rep, deal.id);
    expect(started?.dealId).toBe(deal.id);
    expect(started?.ownerId).toBe(rep.id);

    // Second win, same merchant: no project, no throw.
    const again = await startOnboardingForWonDeal(rep, deal.id);
    expect(again).toBeNull();
    expect(await db.onboardingProject.count({ where: { merchantId: id } })).toBe(1);
  });

  it("counts what is in flight, what is stuck, and how long launches take", async () => {
    const metrics = await onboardingMetrics();
    expect(metrics.inFlight).toBeGreaterThanOrEqual(2);
    expect(metrics.medianDaysToLive).not.toBeNull();
  });

  it("only the owner or an admin can cancel", async () => {
    const id = await makeMerchant("Salt Café", "Starter", admin.id);
    const project = await startOnboarding(admin, { merchantId: id, ownerId: admin.id });

    await expect(cancelOnboarding(rep, project.id)).rejects.toThrow(OnboardingError);
    await cancelOnboarding(admin, project.id);

    const after = await db.onboardingProject.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.status).toBe("CANCELLED");
    // Cancelled work leaves the board without leaving the record.
    const cards = await listOnboarding();
    expect(cards.find((c) => c.id === project.id)).toBeUndefined();
  });
});
