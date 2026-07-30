import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import type { MerchantInput, MerchantListParams } from "@/lib/validators/merchant";
import {
  getMerchantAccess,
  merchantMineWhere,
  merchantSharedWhere,
} from "@/services/merchant-access";
import { audit, shallowDiff } from "@/services/audit";

export const MERCHANTS_PAGE_SIZE = 100;

// Fields included in audit diffs (everything user-editable).
const AUDITED_FIELDS = [
  "name",
  "category",
  "status",
  "website",
  "phone",
  "email",
  "address",
  "notes",
  "posSystem",
  "monthlyTxnVolume",
  "loyaltyLive",
  "subscriptionPlan",
  "branches",
  "beta",
  "latitude",
  "longitude",
  "ownerId",
  "affiliateId",
] as const;

function pickAudited(record: Record<string, unknown>) {
  return Object.fromEntries(AUDITED_FIELDS.map((f) => [f, record[f]]));
}

export async function listMerchants(ctx: SessionUser, params: MerchantListParams) {
  // Hybrid model: everyone sees all merchants; scope narrows to the working set.
  const scopeWhere: Prisma.MerchantWhereInput =
    params.scope === "mine"
      ? merchantMineWhere(ctx)
      : params.scope === "shared"
        ? merchantSharedWhere(ctx)
        : {};

  const where: Prisma.MerchantWhereInput = {
    ...scopeWhere,
    ...(params.status ? { status: params.status } : {}),
    ...(params.owner ? { ownerId: params.owner } : {}),
    ...(params.affiliate ? { affiliateId: params.affiliate } : {}),
    ...(params.pos ? { posSystem: params.pos } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { category: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
            { address: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.MerchantOrderByWithRelationInput =
    params.sort === "name"
      ? { name: params.dir }
      : params.sort === "status"
        ? { status: params.dir }
        : params.sort === "category"
          ? { category: params.dir }
          : params.sort === "posSystem"
            ? { posSystem: params.dir }
            : params.sort === "createdAt"
              ? { createdAt: params.dir }
              : { updatedAt: params.dir };

  const [total, items] = await Promise.all([
    db.merchant.count({ where }),
    db.merchant.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * MERCHANTS_PAGE_SIZE,
      take: MERCHANTS_PAGE_SIZE,
      include: {
        owner: { select: { id: true, name: true } },
        affiliate: { select: { id: true, name: true } },
        shares: { select: { userId: true, permission: true } },
        _count: { select: { contacts: true, deals: true } },
      },
    }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / MERCHANTS_PAGE_SIZE)),
  };
}

// All merchants matching the list filters that have coordinates, for the map
// view. No pagination — the map shows every matching pin.
export async function listMerchantsForMap(ctx: SessionUser, params: MerchantListParams) {
  const scopeWhere: Prisma.MerchantWhereInput =
    params.scope === "mine"
      ? merchantMineWhere(ctx)
      : params.scope === "shared"
        ? merchantSharedWhere(ctx)
        : {};

  const merchantWhere: Prisma.MerchantWhereInput = {
    ...scopeWhere,
    ...(params.status ? { status: params.status } : {}),
    ...(params.owner ? { ownerId: params.owner } : {}),
    ...(params.affiliate ? { affiliateId: params.affiliate } : {}),
    ...(params.pos ? { posSystem: params.pos } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { category: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
            { address: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // One pin per located outlet, so multi-outlet merchants show every branch.
  const outlets = await db.outlet.findMany({
    where: { latitude: { not: null }, longitude: { not: null }, merchant: merchantWhere },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      merchant: {
        select: { id: true, name: true, loyaltyLive: true, status: true, subscriptionPlan: true },
      },
    },
  });

  return outlets.map((o) => ({
    id: o.id,
    merchantId: o.merchant.id,
    name: o.merchant.name,
    outletName: o.name,
    lat: o.latitude!,
    lng: o.longitude!,
    onboarded: o.merchant.loyaltyLive,
    status: o.merchant.status,
    subscriptionPlan: o.merchant.subscriptionPlan,
  }));
}

// Distinct POS systems currently in use, for the merchants-list filter. Free
// text, so we surface the values that actually exist.
export async function listPosSystems(): Promise<string[]> {
  const rows = await db.merchant.findMany({
    where: { posSystem: { not: null } },
    distinct: ["posSystem"],
    orderBy: { posSystem: "asc" },
    select: { posSystem: true },
  });
  return rows.map((r) => r.posSystem!).filter((v) => v.trim() !== "");
}

export async function getMerchant(ctx: SessionUser, id: string) {
  // Everyone can view every merchant (hybrid sharing model).
  const merchant = await db.merchant.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      affiliate: { select: { id: true, name: true, commissionRate: true } },
      shares: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      deals: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, stage: true, value: true, currency: true },
      },
    },
  });
  if (!merchant) return null;

  // Contacts tagged to this merchant — home contacts plus any tagged via the
  // many-to-many link table.
  const contacts = await db.contact.findMany({
    where: { merchantLinks: { some: { merchantId: id } } },
    orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }],
  });

  const access = await getMerchantAccess(ctx, id);
  return { ...merchant, contacts, access: access! };
}

// Merchants the current user can attach contacts to (edit rights required).
export async function listEditableMerchantOptions(ctx: SessionUser) {
  const where: Prisma.MerchantWhereInput = isAdmin(ctx)
    ? {}
    : {
        OR: [
          { ownerId: ctx.id },
          { shares: { some: { userId: ctx.id, permission: "EDIT" } } },
        ],
      };
  return db.merchant.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createMerchant(ctx: SessionUser, input: MerchantInput) {
  // Reps always own what they create; admins may assign anyone.
  const ownerId = isAdmin(ctx) && input.ownerId ? input.ownerId : ctx.id;

  const merchant = await db.merchant.create({
    data: {
      name: input.name,
      category: input.category ?? null,
      status: input.status,
      website: input.website ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      posSystem: input.posSystem ?? null,
      monthlyTxnVolume: input.monthlyTxnVolume ?? null,
      loyaltyLive: input.loyaltyLive,
      subscriptionPlan: input.subscriptionPlan ?? null,
      branches: input.branches ?? null,
      beta: input.beta,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      affiliateId: input.affiliateId ?? null,
      ownerId,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "merchant.create",
    entityType: "MERCHANT",
    entityId: merchant.id,
    merchantId: merchant.id,
    diff: pickAudited(merchant as unknown as Record<string, unknown>),
  });

  return merchant;
}

export async function updateMerchant(ctx: SessionUser, id: string, input: MerchantInput) {
  const existing = await db.merchant.findUnique({ where: { id } });
  if (!existing) throw new Error("Merchant not found");

  const access = await getMerchantAccess(ctx, id);
  if (!access?.canEdit) throw new Error("You don't have edit access to this merchant");

  // Only admins may reassign ownership.
  const ownerId = isAdmin(ctx) && input.ownerId ? input.ownerId : existing.ownerId;

  const updated = await db.merchant.update({
    where: { id },
    data: {
      name: input.name,
      category: input.category ?? null,
      status: input.status,
      website: input.website ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      posSystem: input.posSystem ?? null,
      monthlyTxnVolume: input.monthlyTxnVolume ?? null,
      loyaltyLive: input.loyaltyLive,
      subscriptionPlan: input.subscriptionPlan ?? null,
      beta: input.beta,
      affiliateId: input.affiliateId ?? null,
      // branches, latitude, longitude are derived from the merchant's outlets —
      // the edit form doesn't touch them, so they're left as-is here.
      ownerId,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "merchant.update",
    entityType: "MERCHANT",
    entityId: id,
    merchantId: id,
    diff: shallowDiff(
      pickAudited(existing as unknown as Record<string, unknown>),
      pickAudited(updated as unknown as Record<string, unknown>)
    ),
  });

  return updated;
}

export async function deleteMerchant(ctx: SessionUser, id: string) {
  const existing = await db.merchant.findUnique({ where: { id } });
  if (!existing) throw new Error("Merchant not found");

  const access = await getMerchantAccess(ctx, id);
  if (!access?.canDelete) throw new Error("Only the owner or an admin can delete this merchant");

  // Contacts and deals cascade via the schema.
  await db.merchant.delete({ where: { id } });

  await audit({
    actorId: ctx.id,
    action: "merchant.delete",
    entityType: "MERCHANT",
    entityId: id,
    merchantId: id,
    diff: { name: existing.name },
  });
}
