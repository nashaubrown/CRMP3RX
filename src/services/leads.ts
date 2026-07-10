import type { LeadStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import type { LeadCaptureInput, LeadInput, LeadListParams } from "@/lib/validators/lead";
import { audit } from "@/services/audit";
import { computeLeadScore } from "@/services/lead-scoring";

export const LEADS_PAGE_SIZE = 10;

// Leads follow the hybrid model: org-visible; editable by their owner or an
// admin. Unassigned leads (from the public form) can be claimed by anyone.

function canEditLead(ctx: SessionUser, lead: { ownerId: string | null }): boolean {
  return isAdmin(ctx) || lead.ownerId === ctx.id;
}

async function scoreFor(input: {
  source: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  message?: string | null;
  merchantId?: string | null;
}): Promise<number> {
  let volume: number | null = null;
  if (input.merchantId) {
    const merchant = await db.merchant.findUnique({
      where: { id: input.merchantId },
      select: { monthlyTxnVolume: true },
    });
    volume = merchant?.monthlyTxnVolume ?? null;
  }
  return computeLeadScore({ ...input, merchantMonthlyTxnVolume: volume });
}

export async function listLeads(ctx: SessionUser, params: LeadListParams) {
  const scopeWhere: Prisma.LeadWhereInput =
    params.scope === "mine"
      ? { ownerId: ctx.id }
      : params.scope === "unassigned"
        ? { ownerId: null }
        : {};

  const where: Prisma.LeadWhereInput = {
    ...scopeWhere,
    ...(params.status ? { status: params.status } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { company: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
            { merchant: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.LeadOrderByWithRelationInput =
    params.sort === "createdAt"
      ? { createdAt: params.dir }
      : params.sort === "updatedAt"
        ? { updatedAt: params.dir }
        : { score: params.dir };

  const [total, items] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * LEADS_PAGE_SIZE,
      take: LEADS_PAGE_SIZE,
      include: {
        owner: { select: { id: true, name: true } },
        merchant: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
  };
}

export async function getLead(ctx: SessionUser, id: string) {
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      merchant: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!lead) return null;
  return { ...lead, canEdit: canEditLead(ctx, lead), canClaim: lead.ownerId === null };
}

export async function createLead(ctx: SessionUser, input: LeadInput) {
  const score = await scoreFor(input);

  const lead = await db.lead.create({
    data: {
      source: input.source,
      status: input.status,
      score,
      name: input.name ?? null,
      company: input.company ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      message: input.message ?? null,
      merchantId: input.merchantId ?? null,
      ownerId: ctx.id,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "lead.create",
    entityType: "LEAD",
    entityId: lead.id,
    merchantId: input.merchantId ?? null,
    diff: { source: input.source, name: input.name, company: input.company, score },
  });

  return lead;
}

// Public capture form — no session; rate-limited at the action layer.
export async function captureLead(input: LeadCaptureInput) {
  const score = await scoreFor({ ...input, source: "WEBSITE" });

  const lead = await db.lead.create({
    data: {
      source: "WEBSITE",
      status: "NEW",
      score,
      name: input.name,
      company: input.company,
      email: input.email ?? null,
      phone: input.phone ?? null,
      message: input.message ?? null,
      ownerId: null, // unassigned: reps claim from the leads list
    },
  });

  await audit({
    actorId: null,
    action: "lead.capture",
    entityType: "LEAD",
    entityId: lead.id,
    diff: { name: input.name, company: input.company, score },
  });

  return lead;
}

export async function updateLead(ctx: SessionUser, id: string, input: LeadInput) {
  const existing = await db.lead.findUnique({ where: { id } });
  if (!existing) throw new Error("Lead not found");
  if (!canEditLead(ctx, existing)) throw new Error("Only the lead's owner or an admin can edit it");

  const score = await scoreFor(input);

  const updated = await db.lead.update({
    where: { id },
    data: {
      source: input.source,
      status: input.status,
      score,
      name: input.name ?? null,
      company: input.company ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      message: input.message ?? null,
      merchantId: input.merchantId ?? null,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "lead.update",
    entityType: "LEAD",
    entityId: id,
    merchantId: updated.merchantId,
    diff: { status: { from: existing.status, to: updated.status }, score },
  });

  return updated;
}

export async function setLeadStatus(ctx: SessionUser, id: string, status: LeadStatus) {
  const existing = await db.lead.findUnique({ where: { id } });
  if (!existing) throw new Error("Lead not found");
  if (!canEditLead(ctx, existing))
    throw new Error("Only the lead's owner or an admin can update it");

  const updated = await db.lead.update({ where: { id }, data: { status } });

  await audit({
    actorId: ctx.id,
    action: "lead.status",
    entityType: "LEAD",
    entityId: id,
    merchantId: existing.merchantId,
    diff: { status: { from: existing.status, to: status } },
  });

  return updated;
}

export async function claimLead(ctx: SessionUser, id: string) {
  const existing = await db.lead.findUnique({ where: { id } });
  if (!existing) throw new Error("Lead not found");
  if (existing.ownerId && existing.ownerId !== ctx.id && !isAdmin(ctx)) {
    throw new Error("Lead is already assigned");
  }

  const updated = await db.lead.update({ where: { id }, data: { ownerId: ctx.id } });

  await audit({
    actorId: ctx.id,
    action: "lead.claim",
    entityType: "LEAD",
    entityId: id,
    merchantId: existing.merchantId,
  });

  return updated;
}

export async function deleteLead(ctx: SessionUser, id: string) {
  const existing = await db.lead.findUnique({ where: { id } });
  if (!existing) throw new Error("Lead not found");
  if (!canEditLead(ctx, existing))
    throw new Error("Only the lead's owner or an admin can delete it");

  await db.lead.delete({ where: { id } });

  await audit({
    actorId: ctx.id,
    action: "lead.delete",
    entityType: "LEAD",
    entityId: id,
    merchantId: existing.merchantId,
    diff: { name: existing.name, company: existing.company },
  });
}

// Convert a qualified lead into a merchant + contact owned by the converter.
export async function convertLead(ctx: SessionUser, id: string) {
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new Error("Lead not found");
  if (!canEditLead(ctx, lead)) throw new Error("Claim the lead before converting it");
  if (lead.merchantId) throw new Error("Lead is already linked to a merchant");
  if (!lead.company) throw new Error("Lead needs a company name to convert");

  const [firstName, ...rest] = (lead.name ?? "Unknown Contact").split(" ");

  const result = await db.$transaction(async (tx) => {
    const merchant = await tx.merchant.create({
      data: {
        name: lead.company!,
        status: "PROSPECT",
        email: lead.email,
        phone: lead.phone,
        notes: lead.message ? `From lead: ${lead.message}` : null,
        ownerId: ctx.id,
      },
    });
    const contact = await tx.contact.create({
      data: {
        firstName: firstName || "Unknown",
        lastName: rest.join(" ") || "-",
        email: lead.email,
        phone: lead.phone,
        isPrimary: true,
        merchantId: merchant.id,
        ownerId: ctx.id,
      },
    });
    await tx.lead.update({
      where: { id },
      data: { merchantId: merchant.id, contactId: contact.id, status: "QUALIFIED", ownerId: ctx.id },
    });
    return { merchant, contact };
  });

  await audit({
    actorId: ctx.id,
    action: "lead.convert",
    entityType: "LEAD",
    entityId: id,
    merchantId: result.merchant.id,
    diff: { merchantName: result.merchant.name },
  });
  await audit({
    actorId: ctx.id,
    action: "merchant.create",
    entityType: "MERCHANT",
    entityId: result.merchant.id,
    merchantId: result.merchant.id,
    diff: { name: result.merchant.name, source: "lead conversion" },
  });

  return result;
}
