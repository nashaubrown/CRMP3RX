"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import {
  devTicketCommentSchema,
  devTicketSchema,
  devTicketStatusSchema,
} from "@/lib/validators/dev-ticket";
import {
  addDevTicketAttachment,
  addDevTicketComment,
  createDevTicket,
  deleteDevTicket,
  DevTicketError,
  moveDevTicket,
  updateDevTicket,
} from "@/services/dev-tickets";

type Result = { error: string | null };

function toMessage(e: unknown): string {
  if (e instanceof DevTicketError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function createDevTicketAction(
  input: unknown
): Promise<Result & { id?: string }> {
  const ctx = await requireUserOrThrow();
  const parsed = devTicketSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid ticket" };
  try {
    const t = await createDevTicket(ctx, parsed.data);
    revalidatePath("/dev");
    return { error: null, id: t.id };
  } catch (e) {
    return { error: toMessage(e) };
  }
}

export async function updateDevTicketAction(ticketId: string, input: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = devTicketSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid ticket" };
  try {
    await updateDevTicket(ctx, ticketId, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/dev");
  revalidatePath(`/dev/${ticketId}`);
  return { error: null };
}

export async function moveDevTicketAction(ticketId: string, status: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = devTicketStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status" };
  try {
    await moveDevTicket(ctx, ticketId, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/dev");
  revalidatePath(`/dev/${ticketId}`);
  return { error: null };
}

export async function deleteDevTicketAction(ticketId: string): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteDevTicket(ctx, ticketId);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/dev");
  return { error: null };
}

export async function addDevCommentAction(ticketId: string, input: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = devTicketCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid comment" };
  try {
    await addDevTicketComment(ctx, ticketId, parsed.data.body);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath(`/dev/${ticketId}`);
  return { error: null };
}

export async function addDevAttachmentAction(
  ticketId: string,
  formData: FormData
): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Pick a file first." };
  try {
    await addDevTicketAttachment(ctx, ticketId, {
      filename: file.name,
      contentType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath(`/dev/${ticketId}`);
  return { error: null };
}
