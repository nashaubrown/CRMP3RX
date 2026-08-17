import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { createDevTicket, moveDevTicket } from "@/services/dev-tickets";
import {
  addRoadmapDemand,
  createRoadmapItem,
  deleteRoadmapItem,
  linkTicketToRoadmap,
  RoadmapError,
  setRoadmapStage,
  ticketProgress,
  toggleRoadmapVote,
} from "@/services/roadmap";

const suffix = `rdm-${Math.random().toString(36).slice(2, 8)}`;
let rep: SessionUser;
let dev: SessionUser;
let merchantId: string;

beforeAll(async () => {
  const [r, d] = await Promise.all([
    db.user.create({ data: { name: "Rdm Rep", email: `rep-${suffix}@t.mv`, role: "SALES_REP" } }),
    db.user.create({ data: { name: "Rdm Dev", email: `dev-${suffix}@t.mv`, role: "DEVELOPER" } }),
  ]);
  rep = { id: r.id, role: "SALES_REP", name: r.name };
  dev = { id: d.id, role: "DEVELOPER", name: d.name };
  const m = await db.merchant.create({ data: { name: `Wisher Café ${suffix}`, ownerId: r.id } });
  merchantId = m.id;
});

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await db.emailMessage.deleteMany({ where: { sentById: { in: [rep.id, dev.id] } } });
  await db.devTicket.deleteMany({ where: { title: { contains: suffix } } });
  await db.roadmapItem.deleteMany({ where: { title: { contains: suffix } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [rep.id, dev.id] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("roadmap", () => {
  it("a suggestion starts at Suggested with the suggester's vote on it", async () => {
    const item = await createRoadmapItem(rep, {
      title: `Scheduled rewards ${suffix}`,
      description: "Start a reward on a chosen date",
      product: "MERCHANT_PORTAL",
    });
    expect(item.stage).toBe("SUGGESTED");
    const votes = await db.roadmapVote.count({ where: { itemId: item.id } });
    expect(votes).toBe(1);
  });

  it("votes toggle, one per person", async () => {
    const item = await createRoadmapItem(rep, {
      title: `Voting ${suffix}`,
      product: "PERX_APP",
    });
    expect((await toggleRoadmapVote(dev, item.id)).voted).toBe(true);
    expect(await db.roadmapVote.count({ where: { itemId: item.id } })).toBe(2);
    expect((await toggleRoadmapVote(dev, item.id)).voted).toBe(false);
    expect(await db.roadmapVote.count({ where: { itemId: item.id } })).toBe(1);
  });

  it("merchant demand is unique per merchant; re-adding refreshes the note", async () => {
    const item = await createRoadmapItem(rep, {
      title: `Demand ${suffix}`,
      product: "MERCHANT_PORTAL",
    });
    await addRoadmapDemand(rep, item.id, merchantId, "would pay for this");
    await addRoadmapDemand(rep, item.id, merchantId, "asked again in August");
    const demands = await db.roadmapDemand.findMany({ where: { itemId: item.id } });
    expect(demands).toHaveLength(1);
    expect(demands[0].note).toBe("asked again in August");
  });

  it("linking a ticket promotes a planning-stage item to In development", async () => {
    const item = await createRoadmapItem(rep, {
      title: `Promote ${suffix}`,
      product: "CRM",
    });
    const ticket = await createDevTicket(dev, {
      title: `Build promote ${suffix}`,
      type: "FEATURE",
      product: "CRM",
      priority: "MEDIUM",
    });
    await linkTicketToRoadmap(dev, item.id, ticket.id);
    const after = await db.roadmapItem.findUnique({ where: { id: item.id } });
    expect(after?.stage).toBe("IN_DEVELOPMENT");
  });

  it("progress rolls up from linked tickets, ignoring Won't-do", () => {
    expect(
      ticketProgress([
        { status: "DONE" },
        { status: "IN_PROGRESS" },
        { status: "WONT_DO" },
        { status: "DONE" },
      ])
    ).toEqual({ done: 2, total: 3 });
  });

  it("an item with open tickets can't slide back to planning; shipping stamps shippedAt", async () => {
    const item = await createRoadmapItem(rep, {
      title: `Guard ${suffix}`,
      product: "CRM",
    });
    const ticket = await createDevTicket(dev, {
      title: `Guard work ${suffix}`,
      type: "FEATURE",
      product: "CRM",
      priority: "LOW",
    });
    await linkTicketToRoadmap(dev, item.id, ticket.id);
    await expect(setRoadmapStage(rep, item.id, "PLANNED")).rejects.toThrow(RoadmapError);

    await moveDevTicket(dev, ticket.id, "DONE");
    const shipped = await setRoadmapStage(rep, item.id, "SHIPPED");
    expect(shipped.shippedAt).not.toBeNull();
  });

  it("only the suggester or an admin can delete", async () => {
    const item = await createRoadmapItem(rep, { title: `Del ${suffix}`, product: "CRM" });
    await expect(deleteRoadmapItem(dev, item.id)).rejects.toThrow(RoadmapError);
    await deleteRoadmapItem(rep, item.id);
  });
});
