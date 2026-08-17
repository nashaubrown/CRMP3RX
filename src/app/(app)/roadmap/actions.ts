"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import {
  roadmapCommentSchema,
  roadmapDemandSchema,
  roadmapItemSchema,
  roadmapItemUpdateSchema,
  roadmapStageSchema,
} from "@/lib/validators/roadmap";
import { devTicketSchema } from "@/lib/validators/dev-ticket";
import { createDevTicket, DevTicketError } from "@/services/dev-tickets";
import {
  addRoadmapComment,
  addRoadmapDemand,
  createRoadmapItem,
  deleteRoadmapItem,
  linkTicketToRoadmap,
  removeRoadmapDemand,
  RoadmapError,
  setRoadmapStage,
  toggleRoadmapVote,
  unlinkTicketFromRoadmap,
  updateRoadmapItem,
} from "@/services/roadmap";

type Result = { error: string | null };

function toMessage(e: unknown): string {
  if (e instanceof RoadmapError || e instanceof DevTicketError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

function revalidate(itemId?: string) {
  revalidatePath("/roadmap");
  if (itemId) revalidatePath(`/roadmap/${itemId}`);
}

export async function suggestRoadmapItemAction(input: unknown): Promise<Result & { id?: string }> {
  const ctx = await requireUserOrThrow();
  const parsed = roadmapItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid idea" };
  try {
    const item = await createRoadmapItem(ctx, parsed.data);
    revalidate();
    return { error: null, id: item.id };
  } catch (e) {
    return { error: toMessage(e) };
  }
}

export async function updateRoadmapItemAction(itemId: string, input: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = roadmapItemUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid update" };
  try {
    await updateRoadmapItem(ctx, itemId, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate(itemId);
  return { error: null };
}

export async function setRoadmapStageAction(itemId: string, stage: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = roadmapStageSchema.safeParse(stage);
  if (!parsed.success) return { error: "Invalid stage" };
  try {
    await setRoadmapStage(ctx, itemId, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate(itemId);
  return { error: null };
}

export async function toggleRoadmapVoteAction(itemId: string): Promise<Result & { voted?: boolean }> {
  const ctx = await requireUserOrThrow();
  try {
    const res = await toggleRoadmapVote(ctx, itemId);
    revalidate(itemId);
    return { error: null, voted: res.voted };
  } catch (e) {
    return { error: toMessage(e) };
  }
}

export async function addRoadmapDemandAction(itemId: string, input: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = roadmapDemandSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid demand" };
  try {
    await addRoadmapDemand(ctx, itemId, parsed.data.merchantId, parsed.data.note);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate(itemId);
  return { error: null };
}

export async function removeRoadmapDemandAction(itemId: string, demandId: string): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await removeRoadmapDemand(ctx, demandId);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate(itemId);
  return { error: null };
}

export async function addRoadmapCommentAction(itemId: string, input: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = roadmapCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid comment" };
  try {
    await addRoadmapComment(ctx, itemId, parsed.data.body);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate(itemId);
  return { error: null };
}

export async function deleteRoadmapItemAction(itemId: string): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteRoadmapItem(ctx, itemId);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate();
  return { error: null };
}

export async function linkTicketAction(itemId: string, ticketId: string): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await linkTicketToRoadmap(ctx, itemId, ticketId);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate(itemId);
  revalidatePath("/dev");
  return { error: null };
}

export async function unlinkTicketAction(itemId: string, ticketId: string): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await unlinkTicketFromRoadmap(ctx, ticketId);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidate(itemId);
  revalidatePath("/dev");
  return { error: null };
}

// Spawn a dev ticket already linked to the item — the normal way work starts.
export async function createLinkedTicketAction(
  itemId: string,
  input: unknown
): Promise<Result & { ticketId?: string }> {
  const ctx = await requireUserOrThrow();
  const parsed = devTicketSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid ticket" };
  try {
    const t = await createDevTicket(ctx, parsed.data);
    await linkTicketToRoadmap(ctx, itemId, t.id);
    revalidate(itemId);
    revalidatePath("/dev");
    return { error: null, ticketId: t.id };
  } catch (e) {
    return { error: toMessage(e) };
  }
}
