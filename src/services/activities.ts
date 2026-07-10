import type { EntityType } from "@prisma/client";

import { db } from "@/lib/db";
import { parseMvLocal } from "@/lib/datetime";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";
import type { ActivityInput } from "@/lib/validators/activity";
import { contactScope } from "@/services/contacts";
import { audit } from "@/services/audit";

// Visibility of an activity follows visibility of the record it's attached to.
export async function assertEntityVisible(
  ctx: SessionUser,
  entityType: EntityType,
  entityId: string
) {
  if (entityType === "MERCHANT") {
    const found = await db.merchant.findFirst({
      where: isAdmin(ctx) ? { id: entityId } : { id: entityId, ownerId: ctx.id },
      select: { id: true },
    });
    if (found) return;
  } else if (entityType === "CONTACT") {
    const found = await db.contact.findFirst({
      where: { AND: [{ id: entityId }, contactScope(ctx)] },
      select: { id: true },
    });
    if (found) return;
  } else {
    const found = await db.deal.findFirst({
      where: isAdmin(ctx) ? { id: entityId } : { id: entityId, ownerId: ctx.id },
      select: { id: true },
    });
    if (found) return;
  }
  throw new Error("Record not found");
}

export async function listActivitiesForEntity(
  ctx: SessionUser,
  entityType: EntityType,
  entityId: string
) {
  await assertEntityVisible(ctx, entityType, entityId);
  return db.activity.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, name: true } } },
  });
}

export async function createActivity(ctx: SessionUser, input: ActivityInput) {
  await assertEntityVisible(ctx, input.entityType, input.entityId);

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
    diff: { activityId: id },
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
    diff: { activityId: id, subject: existing.subject },
  });
}
