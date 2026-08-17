import type { DevProduct, RoadmapScore, RoadmapStage } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { audit } from "@/services/audit";
import { canSeeMerchant } from "@/services/merchant-access";

export class RoadmapError extends Error {}

export const ROADMAP_STAGES: RoadmapStage[] = [
  "SUGGESTED",
  "CONSIDERING",
  "PLANNED",
  "IN_DEVELOPMENT",
  "SHIPPED",
  "DECLINED",
];

export const ROADMAP_STAGE_LABELS: Record<RoadmapStage, string> = {
  SUGGESTED: "Suggested",
  CONSIDERING: "Considering",
  PLANNED: "Planned",
  IN_DEVELOPMENT: "In development",
  SHIPPED: "Shipped",
  DECLINED: "Declined",
};

const ITEM_INCLUDE = {
  suggestedBy: { select: { id: true, name: true } },
  votes: { select: { userId: true } },
  demands: {
    select: {
      id: true,
      note: true,
      merchant: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  tickets: {
    select: { id: true, number: true, title: true, status: true },
    orderBy: { number: "asc" as const },
  },
  _count: { select: { comments: true } },
} as const;

// Progress rolls up from the linked tickets — never typed in by hand.
export function ticketProgress(tickets: { status: string }[]) {
  const counted = tickets.filter((t) => t.status !== "WONT_DO");
  const done = counted.filter((t) => t.status === "DONE").length;
  return { done, total: counted.length };
}

// The whole team sees the whole roadmap.
export function listRoadmapItems(filters: { product?: DevProduct; q?: string } = {}) {
  return db.roadmapItem.findMany({
    where: {
      ...(filters.product ? { product: filters.product } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" as const } },
              { description: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    // Demand-first within a stage: the most-wanted ideas float up.
    orderBy: [{ demands: { _count: "desc" } }, { votes: { _count: "desc" } }, { createdAt: "desc" }],
    include: ITEM_INCLUDE,
  });
}

export function getRoadmapItem(id: string) {
  return db.roadmapItem.findUnique({
    where: { id },
    include: {
      ...ITEM_INCLUDE,
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function createRoadmapItem(
  ctx: SessionUser,
  input: { title: string; description?: string | null; product: DevProduct }
) {
  const item = await db.roadmapItem.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      product: input.product,
      suggestedById: ctx.id,
    },
    include: ITEM_INCLUDE,
  });
  // The suggester's vote comes free — suggesting is wanting.
  await db.roadmapVote.create({ data: { itemId: item.id, userId: ctx.id } });
  await audit({
    actorId: ctx.id,
    action: "roadmap.suggest",
    entityType: "ROADMAP_ITEM",
    entityId: item.id,
    diff: { title: item.title, product: item.product },
  });
  return item;
}

export async function updateRoadmapItem(
  ctx: SessionUser,
  id: string,
  input: {
    title?: string;
    description?: string | null;
    product?: DevProduct;
    effort?: RoadmapScore | null;
    impact?: RoadmapScore | null;
  }
) {
  const before = await db.roadmapItem.findUnique({ where: { id } });
  if (!before) throw new RoadmapError("Roadmap item not found.");
  const item = await db.roadmapItem.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.product !== undefined ? { product: input.product } : {}),
      ...(input.effort !== undefined ? { effort: input.effort } : {}),
      ...(input.impact !== undefined ? { impact: input.impact } : {}),
    },
  });
  await audit({
    actorId: ctx.id,
    action: "roadmap.update",
    entityType: "ROADMAP_ITEM",
    entityId: id,
    diff: { title: item.title },
  });
  return item;
}

export async function setRoadmapStage(ctx: SessionUser, id: string, stage: RoadmapStage) {
  const before = await db.roadmapItem.findUnique({
    where: { id },
    include: { tickets: { select: { status: true } } },
  });
  if (!before) throw new RoadmapError("Roadmap item not found.");

  // Guard the one transition that lies most easily: an item with live linked
  // tickets can't be walked back to a pre-development stage — unlink the
  // tickets first if the plan really changed.
  const liveTickets = before.tickets.filter((t) => t.status !== "DONE" && t.status !== "WONT_DO");
  if (
    liveTickets.length > 0 &&
    (stage === "SUGGESTED" || stage === "CONSIDERING" || stage === "PLANNED")
  ) {
    throw new RoadmapError(
      "This item has open dev tickets — unlink them before moving it back to planning."
    );
  }

  const item = await db.roadmapItem.update({
    where: { id },
    data: {
      stage,
      shippedAt: stage === "SHIPPED" ? (before.shippedAt ?? new Date()) : null,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "roadmap.stage",
    entityType: "ROADMAP_ITEM",
    entityId: id,
    diff: {
      title: item.title,
      from: ROADMAP_STAGE_LABELS[before.stage],
      to: ROADMAP_STAGE_LABELS[stage],
    },
  });
  return item;
}

export async function deleteRoadmapItem(ctx: SessionUser, id: string) {
  const item = await db.roadmapItem.findUnique({ where: { id } });
  if (!item) throw new RoadmapError("Roadmap item not found.");
  if (!isAdmin(ctx) && item.suggestedById !== ctx.id) {
    throw new RoadmapError("Only the suggester or an admin can delete an idea — decline it instead.");
  }
  await db.roadmapItem.delete({ where: { id } });
  await audit({
    actorId: ctx.id,
    action: "roadmap.delete",
    entityType: "ROADMAP_ITEM",
    entityId: id,
    diff: { title: item.title },
  });
}

// ---- signals -----------------------------------------------------------------

export async function toggleRoadmapVote(ctx: SessionUser, itemId: string) {
  const existing = await db.roadmapVote.findUnique({
    where: { itemId_userId: { itemId, userId: ctx.id } },
  });
  if (existing) {
    await db.roadmapVote.delete({ where: { itemId_userId: { itemId, userId: ctx.id } } });
    return { voted: false };
  }
  await db.roadmapVote.create({ data: { itemId, userId: ctx.id } });
  return { voted: true };
}

export async function addRoadmapDemand(
  ctx: SessionUser,
  itemId: string,
  merchantId: string,
  note?: string | null
) {
  // The rep must at least be able to see the merchant they're speaking for.
  if (!(await canSeeMerchant(ctx, merchantId))) {
    throw new RoadmapError("You can't see that merchant.");
  }
  const demand = await db.roadmapDemand.upsert({
    where: { itemId_merchantId: { itemId, merchantId } },
    create: { itemId, merchantId, note: note ?? null, addedById: ctx.id },
    // Re-adding refreshes the note — the latest quote wins.
    update: { note: note ?? null, addedById: ctx.id },
  });
  await audit({
    actorId: ctx.id,
    action: "roadmap.demand",
    entityType: "ROADMAP_ITEM",
    entityId: itemId,
    merchantId,
    diff: { note: note ?? null },
  });
  return demand;
}

export async function removeRoadmapDemand(ctx: SessionUser, demandId: string) {
  const demand = await db.roadmapDemand.findUnique({ where: { id: demandId } });
  if (!demand) return;
  await db.roadmapDemand.delete({ where: { id: demandId } });
  await audit({
    actorId: ctx.id,
    action: "roadmap.demand_removed",
    entityType: "ROADMAP_ITEM",
    entityId: demand.itemId,
    merchantId: demand.merchantId,
  });
}

export async function addRoadmapComment(ctx: SessionUser, itemId: string, body: string) {
  const item = await db.roadmapItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw new RoadmapError("Roadmap item not found.");
  return db.roadmapComment.create({
    data: { itemId, authorId: ctx.id, body },
    include: { author: { select: { id: true, name: true } } },
  });
}

// ---- the bridge to the Dev board --------------------------------------------

// Linking work to an idea is what moves it to In development — the stage
// follows the board, not the other way round.
async function promoteIfPlanning(ctx: SessionUser, itemId: string) {
  const item = await db.roadmapItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  if (item.stage === "SUGGESTED" || item.stage === "CONSIDERING" || item.stage === "PLANNED") {
    await db.roadmapItem.update({ where: { id: itemId }, data: { stage: "IN_DEVELOPMENT" } });
    await audit({
      actorId: ctx.id,
      action: "roadmap.stage",
      entityType: "ROADMAP_ITEM",
      entityId: itemId,
      diff: {
        title: item.title,
        from: ROADMAP_STAGE_LABELS[item.stage],
        to: ROADMAP_STAGE_LABELS.IN_DEVELOPMENT,
        via: "ticket linked",
      },
    });
  }
}

export async function linkTicketToRoadmap(ctx: SessionUser, itemId: string, ticketId: string) {
  const [item, ticket] = await Promise.all([
    db.roadmapItem.findUnique({ where: { id: itemId }, select: { id: true } }),
    db.devTicket.findUnique({ where: { id: ticketId }, select: { id: true, roadmapItemId: true } }),
  ]);
  if (!item) throw new RoadmapError("Roadmap item not found.");
  if (!ticket) throw new RoadmapError("Ticket not found.");
  await db.devTicket.update({ where: { id: ticketId }, data: { roadmapItemId: itemId } });
  await promoteIfPlanning(ctx, itemId);
}

export async function unlinkTicketFromRoadmap(ctx: SessionUser, ticketId: string) {
  await db.devTicket.update({ where: { id: ticketId }, data: { roadmapItemId: null } });
  void ctx;
}
