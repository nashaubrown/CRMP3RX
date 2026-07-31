import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import {
  createTask,
  getTaskStats,
  listTasks,
  listTasksForRecord,
  moveTask,
  toggleTaskDone,
  updateTask,
} from "@/services/tasks";

const suffix = `task-${Math.random().toString(36).slice(2, 8)}`;
let rep: SessionUser;
let other: SessionUser;
let merchantId: string;

const params = (over: Partial<Parameters<typeof listTasks>[1]> = {}) =>
  ({ scope: "all", status: "open", view: "list", group: "due", assignee: undefined, ...over }) as Parameters<
    typeof listTasks
  >[1];

beforeAll(async () => {
  const u = await db.user.create({
    data: { name: `Task Rep ${suffix}`, email: `rep-${suffix}@t.mv`, role: "SALES_REP" },
  });
  rep = { id: u.id, role: "SALES_REP", name: u.name };
  const o = await db.user.create({
    data: { name: `Other ${suffix}`, email: `other-${suffix}@t.mv`, role: "SALES_REP" },
  });
  other = { id: o.id, role: "SALES_REP", name: o.name };
  const m = await db.merchant.create({ data: { name: `M ${suffix}`, ownerId: u.id } });
  merchantId = m.id;
});

afterAll(async () => {
  await db.task.deleteMany({ where: { title: { contains: suffix } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("task tracker", () => {
  it("creates standalone and merchant-linked tasks", async () => {
    await createTask(rep, {
      title: `Standalone ${suffix}`,
      status: "TODO",
      priority: "HIGH",
      dueAt: "2020-01-01T10:00", // overdue
    });
    const linked = await createTask(rep, {
      title: `Linked ${suffix}`,
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      merchantId,
    });
    expect(linked.merchantId).toBe(merchantId);

    const forRecord = await listTasksForRecord("merchant", merchantId);
    expect(forRecord.some((t) => t.title === `Linked ${suffix}`)).toBe(true);
  });

  it("open filter excludes done; move to DONE sets completedAt", async () => {
    const t = await createTask(rep, { title: `Toggle ${suffix}`, status: "TODO", priority: "LOW" });
    const open = await listTasks(rep, params({ assignee: rep.id }));
    expect(open.some((x) => x.id === t.id)).toBe(true);

    const moved = await moveTask(rep, t.id, "DONE");
    expect(moved.completedAt).not.toBeNull();

    const stillOpen = await listTasks(rep, params({ assignee: rep.id }));
    expect(stillOpen.some((x) => x.id === t.id)).toBe(false);

    const done = await listTasks(rep, params({ assignee: rep.id, status: "done" }));
    expect(done.some((x) => x.id === t.id)).toBe(true);

    // Toggle reopens it.
    await toggleTaskDone(rep, t.id);
    const reopened = await db.task.findUnique({ where: { id: t.id } });
    expect(reopened!.completedAt).toBeNull();
    expect(reopened!.status).toBe("TODO");
  });

  it("stats count open, overdue and done-this-week for the assignee", async () => {
    const stats = await getTaskStats(rep, params({ assignee: rep.id }));
    expect(stats.open).toBeGreaterThanOrEqual(1);
    expect(stats.overdue).toBeGreaterThanOrEqual(1); // the 2020 due task
  });

  it("blocks editing by someone who is neither assignee, creator, nor admin", async () => {
    const t = await createTask(rep, { title: `Locked ${suffix}`, status: "TODO", priority: "LOW" });
    await expect(
      updateTask(other, t.id, { title: "hijack", status: "TODO", priority: "LOW" })
    ).rejects.toThrow();
  });
});
