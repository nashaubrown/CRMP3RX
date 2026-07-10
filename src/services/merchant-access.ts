import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";

// Hybrid sharing model:
//  - VIEW: every authenticated user can see every merchant (and its contacts,
//    deals and activity) — org-wide transparency.
//  - "Mine": owned by me, or explicitly shared with me (any permission) —
//    the rep's working set, used by list filters and dashboard counts.
//  - EDIT: owner, admins, and collaborators holding an EDIT share can modify
//    the merchant, its contacts, and log activity.
//  - DELETE + share management: owner and admins only.

export function merchantMineWhere(ctx: SessionUser): Prisma.MerchantWhereInput {
  return { OR: [{ ownerId: ctx.id }, { shares: { some: { userId: ctx.id } } }] };
}

export function merchantSharedWhere(ctx: SessionUser): Prisma.MerchantWhereInput {
  return { shares: { some: { userId: ctx.id } } };
}

export type MerchantAccess = {
  canEdit: boolean;
  canDelete: boolean;
  canManageShares: boolean;
  // Change history is owner/admin-only — more sensitive than the record.
  canViewHistory: boolean;
};

export async function getMerchantAccess(
  ctx: SessionUser,
  merchantId: string
): Promise<MerchantAccess | null> {
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: {
      ownerId: true,
      shares: { where: { userId: ctx.id }, select: { permission: true } },
    },
  });
  if (!merchant) return null;

  const owner = merchant.ownerId === ctx.id;
  const admin = isAdmin(ctx);
  const editShare = merchant.shares.some((s) => s.permission === "EDIT");

  return {
    canEdit: admin || owner || editShare,
    canDelete: admin || owner,
    canManageShares: admin || owner,
    canViewHistory: admin || owner,
  };
}

export async function assertMerchantEdit(ctx: SessionUser, merchantId: string) {
  const access = await getMerchantAccess(ctx, merchantId);
  if (!access) throw new Error("Merchant not found");
  if (!access.canEdit) throw new Error("You don't have edit access to this merchant");
}

export async function assertMerchantManage(ctx: SessionUser, merchantId: string) {
  const access = await getMerchantAccess(ctx, merchantId);
  if (!access) throw new Error("Merchant not found");
  if (!access.canManageShares)
    throw new Error("Only the owner or an admin can manage this merchant");
}
