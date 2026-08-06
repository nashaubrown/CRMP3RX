import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { canEditAnyRecord, isAdmin } from "@/lib/authz";
import { getCapabilities } from "@/services/permissions";

// Hybrid sharing model:
//  - VIEW: governed by the canSeeAllMerchants capability. On (the default)
//    means org-wide transparency, as before. Off narrows the rep to their own
//    book plus explicit shares — see merchantVisibleWhere.
//  - "Mine": owned by me, or explicitly shared with me (any permission) —
//    the rep's working set, used by list filters and dashboard counts.
//  - EDIT: any signed-in user (see canEditAnyRecord) — the team covers for
//    each other, so ownership isn't an edit boundary. Owner/admin/EDIT-share
//    is still computed for the record, it just no longer restricts editing.
//  - DELETE + share management: owner and admins only.

export function merchantMineWhere(ctx: SessionUser): Prisma.MerchantWhereInput {
  return { OR: [{ ownerId: ctx.id }, { shares: { some: { userId: ctx.id } } }] };
}

export function merchantSharedWhere(ctx: SessionUser): Prisma.MerchantWhereInput {
  return { shares: { some: { userId: ctx.id } } };
}

// What this user is allowed to see at all. Everyone saw every merchant until
// permission sets arrived; a rep without canSeeAllMerchants is now narrowed to
// their own book plus anything explicitly shared with them.
//
// Every merchant read path should start from this — list, detail, search, map
// pins, exports, zone contents — so a restricted rep can't reach a colleague's
// account by any route.
export async function merchantVisibleWhere(
  ctx: SessionUser
): Promise<Prisma.MerchantWhereInput> {
  const caps = await getCapabilities(ctx);
  return caps.canSeeAllMerchants ? {} : merchantMineWhere(ctx);
}

// Can this user open this specific merchant?
export async function canSeeMerchant(ctx: SessionUser, merchantId: string): Promise<boolean> {
  const caps = await getCapabilities(ctx);
  if (caps.canSeeAllMerchants) return true;
  const found = await db.merchant.findFirst({
    where: { id: merchantId, ...merchantMineWhere(ctx) },
    select: { id: true },
  });
  return found !== null;
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

  return {
    canEdit: canEditAnyRecord(ctx),
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
