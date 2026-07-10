import type { EntityType } from "@prisma/client";

import { db } from "@/lib/db";
import { parseMvLocal } from "@/lib/datetime";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";
import type { ActivityInput } from "@/lib/validators/activity";
import { getMerchantAccess } from "@/services/merchant-access";
import { audit } from "@/services/audit";

// Hybrid model: activity is viewable by anyone who can view the record (i.e.
// everyone). Contributing requires edit rights on the underlying merchant;
// completing/deleting an activity requires being its creator (or admin).

export async function resolveMerchantId(
  entityType: EntityType,
  entityId: string
): Promise<string | null> {
  if (entityType === "MERCHANT") {
    const m = await db.merchant.findUnique({ where: { id: entityId }, select: { id: true } });
    return m?.id ?? null;
  }
  if (entityType === "CONTACT") {
    const c = await db.contact.findUnique({
      where: { id: entityId },
      select: { merchantId: true },
    });
    return c?.merchantId ?? null;
  }
  const d = await db.deal.findUnique({ where: { id: entityId }, select: { merchantId: true } });
  return d?.merchantId ?? null;
}

export async function canContribute(
  ctx: SessionUser,
  entityType: EntityType,
  entityId: string
): Promise<boolean> {
  const merchantId = await resolveMerchantId(entityType, entityId);
  if (!merchantId) return false;
  const access = await getMerchantAccess(ctx, merchantId);
  return Boolean(access?.canEdit);
}

export async function listActivitiesForEntity(
  _ctx: SessionUser,
  entityType: EntityType,
  entityId: string
) {
  return db.activity.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, name: true } } },
  });
}

export async function createActivity(ctx: SessionUser, input: ActivityInput) {
  const merchantId = await resolveMerchantId(input.entityType, input.entityId);
  if (!merchantId) throw new Error("Record not found");
  const access = await getMerchantAccess(ctx, merchantId);
  if (!access?.canEdit) throw new Error("You don't have edit access to this record");

  const activity = await db.activity.create({
    data: {
      type: input.type,
      subject: input.subject,
      body: input.body ?? null,
      dueAt: input.dueAt ? parseMvLocal(input.dueAt) : null,
      entityType: input.entityType,
      entityId: input.entityId,
      ownerId: ctx.id,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "activity.create",
    entityType: input.entityType,
    entityId: input.entityId,
    merchantId,
    diff: { activityId: activity.id, type: input.type, subject: input.subject },
  });

  return activity;
}

export async function toggleActivityComplete(ctx: SessionUser, id: string) {
  const existing = await db.activity.findFirst({
    where: isAdmin(ctx) ? { id } : { id, ownerId: ctx.id },
  });
  if (!existing) throw new Error("Activity not found");

  const completedAt = existing.completedAt ? null : new Date();
  const updated = await db.activity.update({ where: { id }, data: { completedAt } });

  await audit({
    actorId: ctx.id,
    action: completedAt ? "activity.complete" : "activity.reopen",
    entityType: existing.entityType,
    entityId: existing.entityId,
    merchantId: await resolveMerchantId(existing.entityType, existing.entityId),
    diff: { activityId: id, subject: existing.subject },
  });

  return updated;
}

export async function deleteActivity(ctx: SessionUser, id: string) {
  const existing = await db.activity.findFirst({
    where: isAdmin(ctx) ? { id } : { id, ownerId: ctx.id },
  });
  if (!existing) throw new Error("Activity not found");

  await db.activity.delete({ where: { id } });

  await audit({
    actorId: ctx.id,
    action: "activity.delete",
    entityType: existing.entityType,
    entityId: existing.entityId,
    merchantId: await resolveMerchantId(existing.entityType, existing.entityId),
    diff: { activityId: id, subject: existing.subject },
  });
}
