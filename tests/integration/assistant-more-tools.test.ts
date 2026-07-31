import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { executeAssistantTool } from "@/services/assistant-tools";

// Coverage for the tools that closed reporting gaps: leads, tasks, recent
// activity, and per-rep deal totals.

const suffix = `amx-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;
let merchantId: string;
let ctx: SessionUser;

beforeAll(async () => {
  const user = await db.user.create({
    data: { name: `Rep ${suffix}`, email: `rep-${suffix}@test.mv`, role: "ADMIN" },
  });
  userId = user.id;
  ctx = { id: user.id, role: "ADMIN", name: user.name, email: user.email };

  const merchant = await db.merchant.create({
    data: { name: `Merchant ${suffix}`, ownerId: userId, status: "PROSPECT" },
  });
  merchantId = merchant.id;

  await db.lead.create({
    data: { source: "test", status: "NEW", ownerId: userId, name: `Lead ${suffix}` },
  });
  await db.deal.create({
    data: {
      title: `Won deal ${suffix}`,
      stage: "WON",
      currency: "MVR",
      value: 5000,
      merchantId,
      ownerId: userId,
    },
  });
  await db.task.create({
    data: {
      title: `Follow up ${suffix}`,
      assigneeId: userId,
      createdById: userId,
      status: "TODO",
      priority: "HIGH",
    },
  });
  await db.activity.create({
    data: {
      type: "NOTE",
      subject: `Called ${suffix}`,
      entityType: "MERCHANT",
      entityId: merchantId,
      ownerId: userId,
    },
  });
});

afterAll(async () => {
  await db.activity.deleteMany({ where: { entityId: merchantId } });
  await db.task.deleteMany({ where: { assigneeId: userId } });
  await db.deal.deleteMany({ where: { ownerId: userId } });
  await db.lead.deleteMany({ where: { ownerId: userId } });
  await db.merchant.deleteMany({ where: { id: merchantId } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe("reporting tools", () => {
  it("list_leads counts new leads", async () => {
    const res = JSON.parse(await executeAssistantTool(ctx, "list_leads", { status: "NEW", scope: "mine" }));
    expect(res.count).toBeGreaterThanOrEqual(1);
    expect(res.leads.some((l: { name: string }) => l.name.includes(suffix))).toBe(true);
  });

  it("list_tasks filters by assignee and priority", async () => {
    const res = JSON.parse(
      await executeAssistantTool(ctx, "list_tasks", { assignee_name: `Rep ${suffix}`, priority: "HIGH" })
    );
    expect(res.count).toBeGreaterThanOrEqual(1);
    expect(res.tasks[0].assignee).toContain(suffix);
  });

  it("recent_activity returns the merchant's timeline", async () => {
    const res = JSON.parse(
      await executeAssistantTool(ctx, "recent_activity", { entity_type: "MERCHANT", entity_id: merchantId })
    );
    expect(res.activities.some((a: { subject: string }) => a.subject.includes(suffix))).toBe(true);
  });

  it("deals_by_rep tallies won value per owner", async () => {
    const res = JSON.parse(await executeAssistantTool(ctx, "deals_by_rep", {}));
    const rep = res.reps.find((r: { owner: string }) => r.owner === `Rep ${suffix}`);
    expect(rep?.won.count).toBe(1);
    expect(rep?.won.mvr).toBe(5000);
  });
});
