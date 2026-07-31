import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { createTask, setTaskAssignee, setTaskDue, moveTask } from "@/services/tasks";

// The reply-to-a-task actions (/assign, /due, /done) run these setters as the
// Sales admin.

const suffix = `tset-${Math.random().toString(36).slice(2, 8)}`;
let adminId: string;
let otherId: string;
let taskId: string;
let admin: SessionUser;

beforeAll(async () => {
  const a = await db.user.create({
    data: { name: `Admin ${suffix}`, email: `a-${suffix}@test.mv`, role: "ADMIN" },
  });
  const b = await db.user.create({
    data: { name: `Other ${suffix}`, email: `b-${suffix}@test.mv`, role: "SALES_REP" },
  });
  adminId = a.id;
  otherId = b.id;
  admin = { id: a.id, role: "ADMIN", name: a.name, email: a.email };
  const task = await createTask(admin, { title: `T ${suffix}`, status: "TODO", priority: "MEDIUM" });
  taskId = task.id;
});

afterAll(async () => {
  await db.task.deleteMany({ where: { id: taskId } });
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, otherId] } } });
});

describe("task reply-action setters", () => {
  it("reassigns a task", async () => {
    await setTaskAssignee(admin, taskId, otherId);
    const t = await db.task.findUnique({ where: { id: taskId } });
    expect(t?.assigneeId).toBe(otherId);
  });

  it("sets a due date", async () => {
    await setTaskDue(admin, taskId, "2026-08-05T09:00");
    const t = await db.task.findUnique({ where: { id: taskId } });
    expect(t?.dueAt).not.toBeNull();
  });

  it("completes a task", async () => {
    await moveTask(admin, taskId, "DONE");
    const t = await db.task.findUnique({ where: { id: taskId } });
    expect(t?.status).toBe("DONE");
    expect(t?.completedAt).not.toBeNull();
  });
});
