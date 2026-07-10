import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";

export type TaskListItem = {
  id: string;
  type: "TASK" | "MEETING";
  subject: string;
  body: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  ownerId: string;
  ownerName: string;
  entityHref: string;
  entityLabel: string;
};

export type TaskFilters = {
  scope: "mine" | "all";
  status: "open" | "done" | "all";
};

// Resolve polymorphic entity links in batch.
async function resolveEntities(
  activities: { entityType: string; entityId: string }[]
): Promise<Map<string, { href: string; label: string }>> {
  const byType = (type: string) =>
    [...new Set(activities.filter((a) => a.entityType === type).map((a) => a.entityId))];

  const [merchants, contacts, deals] = await Promise.all([
    db.merchant.findMany({ where: { id: { in: byType("MERCHANT") } }, select: { id: true, name: true } }),
    db.contact.findMany({
      where: { id: { in: byType("CONTACT") } },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.deal.findMany({ where: { id: { in: byType("DEAL") } }, select: { id: true, title: true } }),
  ]);

  const map = new Map<string, { href: string; label: string }>();
  for (const m of merchants) map.set(`MERCHANT:${m.id}`, { href: `/merchants/${m.id}`, label: m.name });
  for (const c of contacts)
    map.set(`CONTACT:${c.id}`, { href: `/contacts/${c.id}`, label: `${c.firstName} ${c.lastName}` });
  for (const d of deals) map.set(`DEAL:${d.id}`, { href: `/deals/${d.id}`, label: d.title });
  return map;
}

export async function listTasks(ctx: SessionUser, filters: TaskFilters): Promise<TaskListItem[]> {
  const where: Prisma.ActivityWhereInput = {
    type: { in: ["TASK", "MEETING"] },
    ...(filters.scope === "mine" || !isAdmin(ctx) ? { ownerId: ctx.id } : {}),
    ...(filters.status === "open"
      ? { completedAt: null }
      : filters.status === "done"
        ? { completedAt: { not: null } }
        : {}),
  };

  const activities = await db.activity.findMany({
    where,
    orderBy: [{ completedAt: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }],
    take: 100,
    include: { owner: { select: { id: true, name: true } } },
  });

  const entities = await resolveEntities(activities);

  return activities.map((a) => {
    const entity = entities.get(`${a.entityType}:${a.entityId}`) ?? {
      href: "#",
      label: "(deleted record)",
    };
    return {
      id: a.id,
      type: a.type as "TASK" | "MEETING",
      subject: a.subject,
      body: a.body,
      dueAt: a.dueAt,
      completedAt: a.completedAt,
      ownerId: a.owner.id,
      ownerName: a.owner.name,
      entityHref: entity.href,
      entityLabel: entity.label,
    };
  });
}

// Dashboard: open tasks due today or overdue (MV day), plus today's meetings.
export async function listDueToday(ctx: SessionUser) {
  const now = new Date();
  const endOfDayMv = new Date(now);
  // MV is UTC+5 with no DST: end of MV day = 18:59:59 UTC
  endOfDayMv.setUTCHours(18, 59, 59, 999);

  const [activities, meetings] = await Promise.all([
    db.activity.findMany({
      where: {
        ownerId: ctx.id,
        type: { in: ["TASK", "MEETING"] },
        completedAt: null,
        dueAt: { not: null, lte: endOfDayMv },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    db.meeting.findMany({
      where: { hostUserId: ctx.id, status: "CONFIRMED", startAt: { gte: now, lte: endOfDayMv } },
      orderBy: { startAt: "asc" },
      take: 10,
    }),
  ]);

  const entities = await resolveEntities(activities);
  return {
    activities: activities.map((a) => ({
      id: a.id,
      subject: a.subject,
      dueAt: a.dueAt!,
      overdue: a.dueAt! < now,
      entity: entities.get(`${a.entityType}:${a.entityId}`) ?? { href: "#", label: "(deleted)" },
    })),
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
