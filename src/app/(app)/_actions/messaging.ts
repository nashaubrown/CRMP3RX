"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { textToHtml } from "@/lib/html";
import { toE164 } from "@/lib/phone";
import { requireUserOrThrow } from "@/lib/rbac";
import { sendEmailFromRecord, sendSmsFromRecord } from "@/services/messaging";

const emailSchema = z.object({
  to: z.string().email("Enter a valid recipient email"),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.string().trim().min(1, "Body is required").max(20000),
  templateId: z.string().optional(),
  entityType: z.enum(["MERCHANT", "CONTACT", "DEAL"]),
  entityId: z.string().min(1),
  revalidate: z.string().startsWith("/"),
});

export async function sendEmailAction(
  input: z.input<typeof emailSchema>
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await sendEmailFromRecord(ctx, {
      to: parsed.data.to,
      subject: parsed.data.subject,
      // Plain-text editor: escape HTML, then preserve line breaks
      bodyHtml: textToHtml(parsed.data.body),
      templateId: parsed.data.templateId ?? null,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath(parsed.data.revalidate);
  return { error: null };
}

const smsSchema = z.object({
  to: z.string().min(1, "Recipient is required"),
  body: z.string().trim().min(1, "Message is required").max(640),
  templateId: z.string().optional(),
  entityType: z.enum(["MERCHANT", "CONTACT", "DEAL"]),
  entityId: z.string().min(1),
  revalidate: z.string().startsWith("/"),
});

export async function sendSmsAction(
  input: z.input<typeof smsSchema>
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = smsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const e164 = toE164(parsed.data.to);
  if (!e164) return { error: "Enter a valid phone number (e.g. +960 777 1234)" };

  try {
    await sendSmsFromRecord(ctx, {
      to: e164,
      body: parsed.data.body,
      templateId: parsed.data.templateId ?? null,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath(parsed.data.revalidate);
  return { error: null };
}
