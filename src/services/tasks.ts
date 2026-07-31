import type { Prisma, TaskStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { parseMvLocal } from "@/lib/datetime";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import type { TaskInput, TaskListParams } from "@/lib/validators/task";
import { audit } from "@/services/audit";

export type TaskLink = { kind: "merchant" | "contact" | "deal"; href: string; label: string };

export type TaskItem = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueAt: Date | null;
  completedAt: Date | null;
  assigneeId: string;
  assigneeName: string;
  link: TaskLink | null;
};

export type TaskStats = {
  open: number;
  overdue: number;
  dueToday: number;
  doneThisWeek: number;
};

// End of the current Maldives day (UTC+5, no DST) expressed in UTC.
function endOfMvDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(18, 59, 59, 999);
  return d;
}

function taskLink(t: {
  merchant: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  deal: { id: string; title: string } | null;
}): TaskLink | null {
  if (t.merchant) return { kind: "merchant", href: `/merchants/${t.merchant.id}`, label: t.merchant.name };
  if (t.contact)
    return {
      kind: "contact",
      href: `/contacts/${t.contact.id}`,
      label: `${t.contact.firstName} ${t.contact.lastName}`,
    };
  if (t.deal) return { kind: "deal", href: `/deals/${t.deal.id}`, label: t.deal.title };
  return null;
}

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  merchant: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;

function toItem(t: Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>): TaskItem {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt,
    completedAt: t.completedAt,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee.name,
    link: taskLink(t),
  };
}

// The set of tasks matching the page filters (assignee / priority / search),
// team-wide. Status filtering is applied per-call by the caller when needed.
function baseWhere(ctx: SessionUser, params: TaskListParams): Prisma.TaskWhereInput {
  return {
    ...(params.scope === "mine" ? { assigneeId: ctx.id } : {}),
    ...(params.assignee ? { assigneeId: params.assignee } : {}),
    ...(params.priority ? { priority: params.priority } : {}),
    ...(params.q ? { title: { contains: params.q, mode: "insensitive" } } : {}),
  };
}

export async function listTasks(ctx: SessionUser, params: TaskListParams): Promise<TaskItem[]> {
  const statusWhere: Prisma.TaskWhereInput =
    params.status === "open"
      ? { status: { not: "DONE" } }
      : params.status === "done"
        ? { status: "DONE" }
        : params.status === "all"
          ? {}
          : { status: params.status as TaskStatus };

  const tasks = await db.task.findMany({
    where: { ...baseWhere(ctx, params), ...statusWhere },
    orderBy: [
      { status: "asc" },
      { position: "asc" },
      { dueAt: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 500,
    include: TASK_INCLUDE,
  });
  return tasks.map(toItem);
}

export async function getTaskStats(ctx: SessionUser, params: TaskListParams): Promise<TaskStats> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const where = baseWhere(ctx, params);
  const open: Prisma.TaskWhereInput = { ...where, status: { not: "DONE" } };

  const [openCount, overdue, dueToday, doneThisWeek] = await Promise.all([
    db.task.count({ where: open }),
    db.task.count({ where: { ...open, dueAt: { lt: now } } }),
    db.task.count({ where: { ...open, dueAt: { gte: now, lte: endOfMvDay(now) } } }),
    db.task.count({ where: { ...where, status: "DONE", completedAt: { gte: weekAgo } } }),
  ]);
  return { open: openCount, overdue, dueToday, doneThisWeek };
}

export async function listTasksForRecord(
  kind: "merchant" | "contact" | "deal",
  id: string
): Promise<TaskItem[]> {
  const where: Prisma.TaskWhereInput =
    kind === "merchant" ? { merchantId: id } : kind === "contact" ? { contactId: id } : { dealId: id };
  const tasks = await db.task.findMany({
    where,
    orderBy: [{ completedAt: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    include: TASK_INCLUDE,
  });
  return tasks.map(toItem);
}

async function canEditTask(ctx: SessionUser, id: string): Promise<boolean> {
  if (isAdmin(ctx)) return true;
  const t = await db.task.findUnique({ where: { id }, select: { assigneeId: true, createdById: true } });
  return Boolean(t && (t.assigneeId === ctx.id || t.createdById === ctx.id));
}

function linkData(input: TaskInput) {
  return {
    merchantId: input.merchantId ?? null,
    contactId: input.contactId ?? null,
    dealId: input.dealId ?? null,
  };
}

export async function createTask(ctx: SessionUser, input: TaskInput) {
  const assigneeId = input.assigneeId || ctx.id;
  const status = input.status;
  const task = await db.task.create({
    data: {
      title: input.title,
      notes: input.notes ?? null,
      status,
      priority: input.priority,
      dueAt: input.dueAt ? parseMvLocal(input.dueAt) : null,
      completedAt: status === "DONE" ? new Date() : null,
      assigneeId,
      createdById: ctx.id,
      ...linkData(input),
    },
  });
  await audit({
    actorId: ctx.id,
    action: "task.create",
    entityType: "TASK",
    entityId: task.id,
    merchantId: task.merchantId,
    diff: { title: task.title, assigneeId, status },
  });
  return task;
}

export async function updateTask(ctx: SessionUser, id: string, input: TaskInput) {
  if (!(await canEditTask(ctx, id))) throw new Error("You can't edit this task");
  const status = input.status;
  const existing = await db.task.findUnique({ where: { id }, select: { completedAt: true } });
  const task = await db.task.update({
    where: { id },
    data: {
      title: input.title,
      notes: input.notes ?? null,
      status,
      priority: input.priority,
      dueAt: input.dueAt ? parseMvLocal(input.dueAt) : null,
      // Keep completedAt in step with DONE.
      completedAt: status === "DONE" ? (existing?.completedAt ?? new Date()) : null,
      assigneeId: input.assigneeId || ctx.id,
      ...linkData(input),
    },
  });
  await audit({
    actorId: ctx.id,
    action: "task.update",
    entityType: "TASK",
    entityId: id,
    merchantId: task.merchantId,
    diff: { title: task.title, status },
  });
  return task;
}

// Board drag: change only the status column (and completed flag).
export async function moveTask(ctx: SessionUser, id: string, status: TaskStatus) {
  if (!(await canEditTask(ctx, id))) throw new Error("You can't move this task");
  const maxPos = await db.task.aggregate({ where: { status }, _max: { position: true } });
  const task = await db.task.update({
    where: { id },
    data: {
      status,
      position: (maxPos._max.position ?? 0) + 1,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "task.move",
    entityType: "TASK",
    entityId: id,
    merchantId: task.merchantId,
    diff: { title: task.title, status },
  });
  return task;
}

// Checklist toggle: DONE ↔ TODO.
export async function toggleTaskDone(ctx: SessionUser, id: string) {
  if (!(await canEditTask(ctx, id))) throw new Error("You can't update this task");
  const existing = await db.task.findUnique({ where: { id }, select: { completedAt: true } });
  if (!existing) throw new Error("Task not found");
  const done = existing.completedAt === null;
  return db.task.update({
    where: { id },
    data: { status: done ? "DONE" : "TODO", completedAt: done ? new Date() : null },
  });
}

export async function deleteTask(ctx: SessionUser, id: string) {
  if (!(await canEditTask(ctx, id))) throw new Error("You can't delete this task");
  const existing = await db.task.findUnique({ where: { id }, select: { title: true, merchantId: true } });
  await db.task.delete({ where: { id } });
  await audit({
    actorId: ctx.id,
    action: "task.delete",
    entityType: "TASK",
    entityId: id,
    merchantId: existing?.merchantId ?? null,
    diff: { title: existing?.title },
  });
}

// ---------- Dashboard helpers ----------

// Open tasks due today or overdue (MV day) for the current user, plus today's
// meetings. Feeds the dashboard "on your plate today" card.
export async function listDueToday(ctx: SessionUser) {
  const now = new Date();
  const endOfDayMv = endOfMvDay(now);

  const [tasks, meetings] = await Promise.all([
    db.task.findMany({
      where: {
        assigneeId: ctx.id,
        status: { not: "DONE" },
        dueAt: { not: null, lte: endOfDayMv },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
      include: TASK_INCLUDE,
    }),
    db.meeting.findMany({
      where: { hostUserId: ctx.id, status: "CONFIRMED", startAt: { gte: now, lte: endOfDayMv } },
      orderBy: { startAt: "asc" },
      take: 10,
    }),
  ]);

  return {
    activities: tasks.map((t) => {
      const link = taskLink(t);
      return {
        id: t.id,
        subject: t.title,
        dueAt: t.dueAt!,
        overdue: t.dueAt! < now,
        entity: link ? { href: link.href, label: link.label } : { href: "/tasks", label: "Task" },
      };
    }),
    meetings,
  };
}

// Dashboard: the user's latest outbound communications.
export async function listRecentComms(ctx: SessionUser, limit = 5) {
  const [emails, sms] = await Promise.all([
    db.emailMessage.findMany({
      where: { sentById: ctx.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.smsMessage.findMany({
      where: { sentById: ctx.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  return [
    ...emails.map((e) => ({
      id: e.id,
      channel: "EMAIL" as const,
      to: e.to,
      summary: e.subject,
      status: e.status as string,
      createdAt: e.createdAt,
    })),
    ...sms.map((s) => ({
      id: s.id,
      channel: "SMS" as const,
      to: s.to,
      summary: s.body.length > 60 ? `${s.body.slice(0, 60)}…` : s.body,
      status: s.status as string,
      createdAt: s.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}
