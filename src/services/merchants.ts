import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin, ownerScope } from "@/lib/rbac";
import type { MerchantInput, MerchantListParams } from "@/lib/validators/merchant";
import { audit, shallowDiff } from "@/services/audit";

export const MERCHANTS_PAGE_SIZE = 10;

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
  "ownerId",
] as const;

function pickAudited(record: Record<string, unknown>) {
  return Object.fromEntries(AUDITED_FIELDS.map((f) => [f, record[f]]));
}

export async function listMerchants(ctx: SessionUser, params: MerchantListParams) {
  const where: Prisma.MerchantWhereInput = {
    ...ownerScope(ctx),
    ...(params.status ? { status: params.status } : {}),
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

export async function getMerchant(ctx: SessionUser, id: string) {
  return db.merchant.findFirst({
    where: { id, ...ownerScope(ctx) },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
      deals: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, stage: true, value: true, currency: true },
      },
    },
  });
}

// Merchants the current user can attach contacts/deals to (for selects).
export async function listMerchantOptions(ctx: SessionUser) {
  return db.merchant.findMany({
    where: { ...ownerScope(ctx) },
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
      ownerId,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "merchant.create",
    entityType: "MERCHANT",
    entityId: merchant.id,
    diff: pickAudited(merchant as unknown as Record<string, unknown>),
  });

  return merchant;
}

export async function updateMerchant(ctx: SessionUser, id: string, input: MerchantInput) {
  const existing = await db.merchant.findFirst({ where: { id, ...ownerScope(ctx) } });
  if (!existing) throw new Error("Merchant not found");

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
      ownerId,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "merchant.update",
    entityType: "MERCHANT",
    entityId: id,
    diff: shallowDiff(
      pickAudited(existing as unknown as Record<string, unknown>),
      pickAudited(updated as unknown as Record<string, unknown>)
    ),
  });

  return updated;
}

export async function deleteMerchant(ctx: SessionUser, id: string) {
  const existing = await db.merchant.findFirst({ where: { id, ...ownerScope(ctx) } });
  if (!existing) throw new Error("Merchant not found");

  // Contacts and deals cascade via the schema.
  await db.merchant.delete({ where: { id } });

  await audit({
    actorId: ctx.id,
    action: "merchant.delete",
    entityType: "MERCHANT",
    entityId: id,
    diff: { name: existing.name },
  });
}
