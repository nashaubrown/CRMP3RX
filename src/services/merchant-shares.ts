import type { SharePermission } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { assertMerchantManage } from "@/services/merchant-access";
import { audit } from "@/services/audit";

export async function setMerchantShare(
  ctx: SessionUser,
  merchantId: string,
  userId: string,
  permission: SharePermission
) {
  await assertMerchantManage(ctx, merchantId);

  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { ownerId: true },
  });
  if (!merchant) throw new Error("Merchant not found");
  if (merchant.ownerId === userId) throw new Error("The owner already has full access");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) throw new Error("User not found");

  await db.merchantShare.upsert({
    where: { merchantId_userId: { merchantId, userId } },
    create: { merchantId, userId, permission },
    update: { permission },
  });

  await audit({
    actorId: ctx.id,
    action: "merchant.share",
    entityType: "MERCHANT",
    entityId: merchantId,
    merchantId,
    // userName denormalized on purpose: history should read well even if
    // the user is later deleted.
    diff: { userId, userName: user.name, permission },
  });
}

export async function removeMerchantShare(ctx: SessionUser, merchantId: string, userId: string) {
  await assertMerchantManage(ctx, merchantId);

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await db.merchantShare.deleteMany({ where: { merchantId, userId } });

  await audit({
    actorId: ctx.id,
    action: "merchant.unshare",
    entityType: "MERCHANT",
    entityId: merchantId,
    merchantId,
    diff: { userId, userName: user?.name ?? "unknown user" },
  });
}
