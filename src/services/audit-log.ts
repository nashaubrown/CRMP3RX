import { db } from "@/lib/db";
import { describeEvent, type HistoryEvent } from "@/lib/audit-events";
import type { SessionUser } from "@/lib/rbac";
import { getMerchantAccess } from "@/services/merchant-access";

const HISTORY_LIMIT = 100;

// Full rollup for one merchant: field edits, contacts, shares, activity.
// Owner/admin only.
export async function listMerchantHistory(
  ctx: SessionUser,
  merchantId: string
): Promise<HistoryEvent[]> {
  const access = await getMerchantAccess(ctx, merchantId);
  if (!access?.canViewHistory) throw new Error("Only the owner or an admin can view history");

  const events = await db.auditLog.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    include: { actor: { select: { name: true } } },
  });

  return events.map(describeEvent);
}

// History of a single contact (subset of the merchant rollup). Owner/admin only.
export async function listContactHistory(
  ctx: SessionUser,
  contactId: string,
  merchantId: string
): Promise<HistoryEvent[]> {
  const access = await getMerchantAccess(ctx, merchantId);
  if (!access?.canViewHistory) throw new Error("Only the owner or an admin can view history");

  const events = await db.auditLog.findMany({
    where: { entityType: "CONTACT", entityId: contactId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    include: { actor: { select: { name: true } } },
  });

  return events.map(describeEvent);
}

export type FeedEvent = HistoryEvent & { merchantId: string; merchantName: string };

// Dashboard feed: what OTHERS changed on merchants the user owns.
// (Admins get changes by others across all merchants.)
export async function listChangesToMyMerchants(
  ctx: SessionUser,
  limit = 8
): Promise<FeedEvent[]> {
  // Reps: only merchants they own. Admins: everything.
  const owned =
    ctx.role === "ADMIN"
      ? null
      : await db.merchant.findMany({ where: { ownerId: ctx.id }, select: { id: true } });

  const events = await db.auditLog.findMany({
    where: {
      merchantId: owned ? { in: owned.map((m) => m.id) } : { not: null },
      actorId: { not: ctx.id },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true } } },
  });

  const merchantIds = [...new Set(events.map((e) => e.merchantId!))];
  const merchants = await db.merchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(merchants.map((m) => [m.id, m.name]));

  return events.map((e) => ({
    ...describeEvent(e),
    merchantId: e.merchantId!,
    merchantName: nameById.get(e.merchantId!) ?? "(deleted merchant)",
  }));
}
