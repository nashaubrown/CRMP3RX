import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { isAdmin, type SessionUser } from "@/lib/authz";

// Admin view over the audit trail: who did what, when. Every write in the app
// goes through audit(), so this is the record of work done in the CRM.
//
// Caveat worth knowing: audit() only fires on writes. Someone who signs in and
// only reads leaves no row here — which is why User.lastLoginAt exists
// alongside it.

export class ActivityLogError extends Error {}

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityLogParams = {
  actorId?: string;
  action?: string;
  days?: number;
  page?: number;
};

export async function listActivityLog(ctx: SessionUser, params: ActivityLogParams = {}) {
  if (!isAdmin(ctx)) throw new ActivityLogError("Only admins can view the activity log.");

  const page = Math.max(1, params.page ?? 1);
  const days = params.days && params.days > 0 ? params.days : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: since },
    ...(params.actorId ? { actorId: params.actorId } : {}),
    // Prefix match so "merchant" catches merchant.create / .update / .delete.
    ...(params.action ? { action: { startsWith: params.action } } : {}),
  };

  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
      include: { actor: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)),
  };
}

// The action prefixes present in the data, for the filter dropdown — built
// from what's actually there rather than a hard-coded list that drifts.
export async function listActivityActions(ctx: SessionUser): Promise<string[]> {
  if (!isAdmin(ctx)) throw new ActivityLogError("Only admins can view the activity log.");
  const rows = await db.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 200,
  });
  const prefixes = new Set(rows.map((r) => r.action.split(".")[0]));
  return [...prefixes].sort();
}

export type UserActivitySummary = {
  userId: string;
  name: string;
  email: string;
  role: string;
  disabled: boolean;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
  lastSeenAt: Date | null;
  signInPredatesTracking: boolean;
  actionsLast7Days: number;
  actionsLast30Days: number;
};

// Per-person adoption: when they last signed in, when they last changed
// something, and how much they've done recently.
export async function getUserActivitySummary(
  ctx: SessionUser
): Promise<UserActivitySummary[]> {
  if (!isAdmin(ctx)) throw new ActivityLogError("Only admins can view team activity.");

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since7 = new Date(now - 7 * day);
  const since30 = new Date(now - 30 * day);

  const [users, week, month] = await Promise.all([
    db.user.findMany({
      orderBy: [{ disabledAt: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        disabledAt: true,
        lastLoginAt: true,
        lastActiveAt: true,
        lastSeenAt: true,
      },
    }),
    db.auditLog.groupBy({
      by: ["actorId"],
      where: { createdAt: { gte: since7 }, actorId: { not: null } },
      _count: { _all: true },
    }),
    db.auditLog.groupBy({
      by: ["actorId"],
      where: { createdAt: { gte: since30 }, actorId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const weekBy = new Map(week.map((r) => [r.actorId, r._count._all]));
  const monthBy = new Map(month.map((r) => [r.actorId, r._count._all]));

  return users.map((u) => {
    // Presence with an evidence floor: sign-in tracking started well after
    // some 30-day sessions began, so a person can have changes on record but
    // no recorded sign-in. Whoever demonstrably acted was demonstrably here —
    // "never" would be a lie, so last-seen falls back to their last change.
    const seen = [u.lastSeenAt, u.lastLoginAt, u.lastActiveAt]
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      disabled: Boolean(u.disabledAt),
      lastLoginAt: u.lastLoginAt,
      lastActiveAt: u.lastActiveAt,
      lastSeenAt: seen,
      // True when the sign-in cell would claim "never" against evidence —
      // the UI shows the floor with a marker instead.
      signInPredatesTracking: u.lastLoginAt == null && seen != null,
      actionsLast7Days: weekBy.get(u.id) ?? 0,
      actionsLast30Days: monthBy.get(u.id) ?? 0,
    };
  });
}
