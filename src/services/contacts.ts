import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import type { ContactInput, ContactListParams } from "@/lib/validators/contact";
import {
  assertMerchantEdit,
  getMerchantAccess,
  merchantMineWhere,
  merchantSharedWhere,
} from "@/services/merchant-access";
import { audit, shallowDiff } from "@/services/audit";

export const CONTACTS_PAGE_SIZE = 10;

// Contacts follow the hybrid model: everyone can view them; editing requires
// edit rights on the merchant they belong to.

const AUDITED_FIELDS = [
  "firstName",
  "lastName",
  "title",
  "email",
  "phone",
  "merchantId",
  "isPrimary",
] as const;

function pickAudited(record: Record<string, unknown>) {
  return Object.fromEntries(AUDITED_FIELDS.map((f) => [f, record[f]]));
}

export async function listContacts(ctx: SessionUser, params: ContactListParams) {
  // A contact's working-set scope follows its merchant (same logic as the
  // merchants list): "mine" = merchant owned by or shared with me.
  const scopeWhere: Prisma.ContactWhereInput =
    params.scope === "mine"
      ? { merchant: merchantMineWhere(ctx) }
      : params.scope === "shared"
        ? { merchant: merchantSharedWhere(ctx) }
        : {};

  const where: Prisma.ContactWhereInput = {
    AND: [
      scopeWhere,
      params.merchantId ? { merchantId: params.merchantId } : {},
      params.q
        ? {
            OR: [
              { firstName: { contains: params.q, mode: "insensitive" } },
              { lastName: { contains: params.q, mode: "insensitive" } },
              { email: { contains: params.q, mode: "insensitive" } },
              { title: { contains: params.q, mode: "insensitive" } },
              { merchant: { name: { contains: params.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    params.sort === "name"
      ? [{ firstName: params.dir }, { lastName: params.dir }]
      : params.sort === "merchant"
        ? [{ merchant: { name: params.dir } }]
        : params.sort === "createdAt"
          ? [{ createdAt: params.dir }]
          : [{ updatedAt: params.dir }];

  const [total, items] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * CONTACTS_PAGE_SIZE,
      take: CONTACTS_PAGE_SIZE,
      include: {
        merchant: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            owner: { select: { name: true } },
            shares: { select: { userId: true, permission: true } },
          },
        },
      },
    }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)),
  };
}

export async function getContact(ctx: SessionUser, id: string) {
  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      merchant: { select: { id: true, name: true, ownerId: true } },
      merchantLinks: {
        include: { merchant: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      owner: { select: { id: true, name: true } },
      deals: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, stage: true, value: true, currency: true },
      },
    },
  });
  if (!contact) return null;

  const access = await getMerchantAccess(ctx, contact.merchantId);
  return { ...contact, access: access! };
}

export async function createContact(ctx: SessionUser, input: ContactInput) {
  // First selected merchant is the "home" merchant; edit rights on it required.
  const homeMerchantId = input.merchantIds[0];
  await assertMerchantEdit(ctx, homeMerchantId);

  const contact = await db.contact.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      merchantId: homeMerchantId,
      isPrimary: input.isPrimary,
      ownerId: ctx.id,
      merchantLinks: {
        create: input.merchantIds.map((merchantId) => ({ merchantId })),
      },
    },
  });

  await audit({
    actorId: ctx.id,
    action: "contact.create",
    entityType: "CONTACT",
    entityId: contact.id,
    merchantId: contact.merchantId,
    diff: pickAudited(contact as unknown as Record<string, unknown>),
  });

  return contact;
}

export async function updateContact(ctx: SessionUser, id: string, input: ContactInput) {
  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) throw new Error("Contact not found");

  const homeMerchantId = input.merchantIds[0];
  await assertMerchantEdit(ctx, existing.merchantId);
  if (homeMerchantId !== existing.merchantId) {
    await assertMerchantEdit(ctx, homeMerchantId);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.contact.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        title: input.title ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        merchantId: homeMerchantId,
        isPrimary: input.isPrimary,
      },
    });
    // Sync the merchant tags to exactly the submitted set.
    await tx.contactMerchant.deleteMany({
      where: { contactId: id, merchantId: { notIn: input.merchantIds } },
    });
    await tx.contactMerchant.createMany({
      data: input.merchantIds.map((merchantId) => ({ contactId: id, merchantId })),
      skipDuplicates: true,
    });
    return row;
  });

  await audit({
    actorId: ctx.id,
    action: "contact.update",
    entityType: "CONTACT",
    entityId: id,
    merchantId: updated.merchantId,
    diff: {
      contactName: `${existing.firstName} ${existing.lastName}`,
      changes: shallowDiff(
        pickAudited(existing as unknown as Record<string, unknown>),
        pickAudited(updated as unknown as Record<string, unknown>)
      ),
    },
  });

  return updated;
}

export async function deleteContact(ctx: SessionUser, id: string) {
  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) throw new Error("Contact not found");

  await assertMerchantEdit(ctx, existing.merchantId);

  await db.contact.delete({ where: { id } });

  await audit({
    actorId: ctx.id,
    action: "contact.delete",
    entityType: "CONTACT",
    entityId: id,
    merchantId: existing.merchantId,
    diff: { firstName: existing.firstName, lastName: existing.lastName },
  });
}
