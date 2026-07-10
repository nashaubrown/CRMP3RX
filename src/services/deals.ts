import type { DealStage, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { parseMvLocal } from "@/lib/datetime";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";
import type { DealInput } from "@/lib/validators/deal";
import { audit, shallowDiff } from "@/services/audit";

// Deals follow merchant visibility (org-visible). Editing — including stage
// moves and won/lost — requires: deal owner, admin, or an EDIT share on the
// deal's merchant.

async function editableMerchantIds(ctx: SessionUser): Promise<Set<string>> {
  if (isAdmin(ctx)) return new Set(); // unused for admins
  const shares = await db.merchantShare.findMany({
    where: { userId: ctx.id, permission: "EDIT" },
    select: { merchantId: true },
  });
  return new Set(shares.map((s) => s.merchantId));
}

export async function canEditDeal(
  ctx: SessionUser,
  deal: { ownerId: string; merchantId: string }
): Promise<boolean> {
  if (isAdmin(ctx) || deal.ownerId === ctx.id) return true;
  const share = await db.merchantShare.findUnique({
    where: { merchantId_userId: { merchantId: deal.merchantId, userId: ctx.id } },
    select: { permission: true },
  });
  return share?.permission === "EDIT";
}

const AUDITED_FIELDS = [
  "title",
  "stage",
  "value",
  "currency",
  "expectedCloseDate",
  "lostReason",
  "merchantId",
  "contactId",
  "ownerId",
] as const;

function pickAudited(record: Record<string, unknown>) {
  return Object.fromEntries(
    AUDITED_FIELDS.map((f) => {
      const v = record[f];
      return [f, typeof v === "object" && v !== null && "toNumber" in (v as object) ? Number(v) : v];
    })
  );
}

export type BoardDeal = {
  id: string;
  title: string;
  stage: DealStage;
  value: number;
  currency: "MVR" | "USD";
  expectedCloseDate: string | null;
  merchantId: string;
  merchantName: string;
  ownerId: string;
  ownerName: string;
  canEdit: boolean;
};

export type StageSummary = {
  stage: DealStage;
  count: number;
  totalMvr: number;
  totalUsd: number;
};

export async function getDealsBoard(ctx: SessionUser, scope: "all" | "mine") {
  const where: Prisma.DealWhereInput = scope === "mine" ? { ownerId: ctx.id } : {};

  const [deals, editable] = await Promise.all([
    db.deal.findMany({
      where,
      orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
      include: {
        merchant: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    }),
    editableMerchantIds(ctx),
  ]);

  const admin = isAdmin(ctx);
  const board: BoardDeal[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    stage: d.stage,
    value: Number(d.value),
    currency: d.currency,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    merchantId: d.merchantId,
    merchantName: d.merchant.name,
    ownerId: d.ownerId,
    ownerName: d.owner.name,
    canEdit: admin || d.ownerId === ctx.id || editable.has(d.merchantId),
  }));

  const stages: DealStage[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
  const summaries: StageSummary[] = stages.map((stage) => {
    const inStage = board.filter((d) => d.stage === stage);
    return {
      stage,
      count: inStage.length,
      totalMvr: inStage.filter((d) => d.currency === "MVR").reduce((s, d) => s + d.value, 0),
      totalUsd: inStage.filter((d) => d.currency === "USD").reduce((s, d) => s + d.value, 0),
    };
  });

  return { deals: board, summaries };
}

export async function getDeal(ctx: SessionUser, id: string) {
  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      merchant: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  if (!deal) return null;
  return { ...deal, canEdit: await canEditDeal(ctx, deal) };
}

// Merchant's contacts for the deal form (grouped client-side).
export async function listContactOptionsByMerchant(merchantIds: string[]) {
  const contacts = await db.contact.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true, firstName: true, lastName: true, merchantId: true },
    orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }],
  });
  const byMerchant: Record<string, { id: string; name: string }[]> = {};
  for (const c of contacts) {
    (byMerchant[c.merchantId] ??= []).push({ id: c.id, name: `${c.firstName} ${c.lastName}` });
  }
  return byMerchant;
}

export async function createDeal(ctx: SessionUser, input: DealInput) {
  // Creating a deal on a merchant requires edit rights on that merchant.
  const access = await db.merchant.findUnique({
    where: { id: input.merchantId },
    select: { ownerId: true, shares: { where: { userId: ctx.id }, select: { permission: true } } },
  });
  if (!access) throw new Error("Merchant not found");
  const allowed =
    isAdmin(ctx) ||
    access.ownerId === ctx.id ||
    access.shares.some((s) => s.permission === "EDIT");
  if (!allowed) throw new Error("You don't have edit access to this merchant");

  const maxPosition = await db.deal.aggregate({
    where: { stage: "NEW" },
    _max: { position: true },
  });

  const deal = await db.deal.create({
    data: {
      title: input.title,
      merchantId: input.merchantId,
      contactId: input.contactId ?? null,
      value: input.value,
      currency: input.currency,
      expectedCloseDate: input.expectedCloseDate
        ? parseMvLocal(`${input.expectedCloseDate}T17:00`)
        : null,
      ownerId: isAdmin(ctx) && input.ownerId ? input.ownerId : ctx.id,
      position: (maxPosition._max.position ?? 0) + 1,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "deal.create",
    entityType: "DEAL",
    entityId: deal.id,
    merchantId: deal.merchantId,
    diff: pickAudited(deal as unknown as Record<string, unknown>),
  });

  return deal;
}

export async function updateDeal(ctx: SessionUser, id: string, input: DealInput) {
  const existing = await db.deal.findUnique({ where: { id } });
  if (!existing) throw new Error("Deal not found");
  if (!(await canEditDeal(ctx, existing))) throw new Error("You can't edit this deal");

  const updated = await db.deal.update({
    where: { id },
    data: {
      title: input.title,
      merchantId: input.merchantId,
      contactId: input.contactId ?? null,
      value: input.value,
      currency: input.currency,
      expectedCloseDate: input.expectedCloseDate
        ? parseMvLocal(`${input.expectedCloseDate}T17:00`)
        : null,
      ownerId: isAdmin(ctx) && input.ownerId ? input.ownerId : existing.ownerId,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "deal.update",
    entityType: "DEAL",
    entityId: id,
    merchantId: updated.merchantId,
    diff: shallowDiff(
      pickAudited(existing as unknown as Record<string, unknown>),
      pickAudited(updated as unknown as Record<string, unknown>)
    ),
  });

  return updated;
}

export async function moveDealStage(
  ctx: SessionUser,
  dealId: string,
  stage: DealStage,
  lostReason?: string
) {
  const existing = await db.deal.findUnique({ where: { id: dealId } });
  if (!existing) throw new Error("Deal not found");
  if (!(await canEditDeal(ctx, existing))) throw new Error("You can't move this deal");
  if (existing.stage === stage) return existing;
  if (stage === "LOST" && !lostReason?.trim()) throw new Error("A lost reason is required");

  const maxPosition = await db.deal.aggregate({ where: { stage }, _max: { position: true } });

  const updated = await db.deal.update({
    where: { id: dealId },
    data: {
      stage,
      position: (maxPosition._max.position ?? 0) + 1,
      lostReason: stage === "LOST" ? lostReason!.trim() : null,
      closedAt: stage === "WON" || stage === "LOST" ? new Date() : null,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "deal.stage",
    entityType: "DEAL",
    entityId: dealId,
    merchantId: existing.merchantId,
    diff: {
      title: existing.title,
      stage: { from: existing.stage, to: stage },
      ...(stage === "LOST" ? { lostReason } : {}),
    },
  });

  return updated;
}

export async function deleteDeal(ctx: SessionUser, id: string) {
  const existing = await db.deal.findUnique({ where: { id } });
  if (!existing) throw new Error("Deal not found");
  if (!isAdmin(ctx) && existing.ownerId !== ctx.id) {
    throw new Error("Only the deal's owner or an admin can delete it");
  }

  await db.deal.delete({ where: { id } });

  await audit({
    actorId: ctx.id,
    action: "deal.delete",
    entityType: "DEAL",
    entityId: id,
    merchantId: existing.merchantId,
    diff: { title: existing.title },
  });
}
