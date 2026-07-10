import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";
import type { ContactInput, ContactListParams } from "@/lib/validators/contact";
import { audit, shallowDiff } from "@/services/audit";

export const CONTACTS_PAGE_SIZE = 10;

// A contact is visible when the user owns it directly OR owns its merchant.
export function contactScope(ctx: SessionUser): Prisma.ContactWhereInput {
  if (isAdmin(ctx)) return {};
  return { OR: [{ ownerId: ctx.id }, { merchant: { ownerId: ctx.id } }] };
}

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
  const where: Prisma.ContactWhereInput = {
    AND: [
      contactScope(ctx),
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
      include: { merchant: { select: { id: true, name: true } } },
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
  return db.contact.findFirst({
    where: { AND: [{ id }, contactScope(ctx)] },
    include: {
      merchant: { select: { id: true, name: true, ownerId: true } },
      owner: { select: { id: true, name: true } },
      deals: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, stage: true, value: true, currency: true },
      },
    },
  });
}

async function assertMerchantVisible(ctx: SessionUser, merchantId: string) {
  const merchant = await db.merchant.findFirst({
    where: isAdmin(ctx) ? { id: merchantId } : { id: merchantId, ownerId: ctx.id },
    select: { id: true },
  });
  if (!merchant) throw new Error("Merchant not found");
}

export async function createContact(ctx: SessionUser, input: ContactInput) {
  await assertMerchantVisible(ctx, input.merchantId);

  const contact = await db.contact.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      merchantId: input.merchantId,
      isPrimary: input.isPrimary,
      ownerId: ctx.id,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "contact.create",
    entityType: "CONTACT",
    entityId: contact.id,
    diff: pickAudited(contact as unknown as Record<string, unknown>),
  });

  return contact;
}

export async function updateContact(ctx: SessionUser, id: string, input: ContactInput) {
  const existing = await db.contact.findFirst({ where: { AND: [{ id }, contactScope(ctx)] } });
  if (!existing) throw new Error("Contact not found");
  if (input.merchantId !== existing.merchantId) {
    await assertMerchantVisible(ctx, input.merchantId);
  }

  const updated = await db.contact.update({
    where: { id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      merchantId: input.merchantId,
      isPrimary: input.isPrimary,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "contact.update",
    entityType: "CONTACT",
    entityId: id,
    diff: shallowDiff(
      pickAudited(existing as unknown as Record<string, unknown>),
      pickAudited(updated as unknown as Record<string, unknown>)
    ),
  });

  return updated;
}

export async function deleteContact(ctx: SessionUser, id: string) {
  const existing = await db.contact.findFirst({ where: { AND: [{ id }, contactScope(ctx)] } });
  if (!existing) throw new Error("Contact not found");

  await db.contact.delete({ where: { id } });

  await audit({
    actorId: ctx.id,
    action: "contact.delete",
    entityType: "CONTACT",
    entityId: id,
    diff: { firstName: existing.firstName, lastName: existing.lastName },
  });
}
