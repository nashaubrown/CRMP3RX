"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/rbac";
import { createApiKey, revokeApiKey } from "@/services/api-keys";
import { cancelMeeting, saveAvailability } from "@/services/scheduling";

const availabilitySchema = z.object({
  bookingSlug: z
    .string()
    .trim()
    .min(2, "Booking link must be at least 2 characters")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  slotDurationMins: z.coerce.number().int().min(15).max(120),
  bufferMins: z.coerce.number().int().min(0).max(60),
  rules: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          startMinutes: z.number().int().min(0).max(24 * 60),
          endMinutes: z.number().int().min(0).max(24 * 60),
        })
        .refine((r) => r.endMinutes > r.startMinutes, {
          message: "End must be after start",
        })
    )
    .max(7),
});

export async function saveAvailabilityAction(
  input: z.input<typeof availabilitySchema>
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await saveAvailability(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function disconnectCalendarAction() {
  const ctx = await requireUserOrThrow();
  await db.googleCalendarAccount.deleteMany({ where: { userId: ctx.id } });
  revalidatePath("/settings");
}

export async function createApiKeyAction(
  name: string
): Promise<{ error: string | null; token?: string }> {
  const ctx = await requireUserOrThrow();
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) return { error: "Give the key a short name" };

  try {
    const { token } = await createApiKey(ctx, trimmed);
    revalidatePath("/settings");
    // Returned once to the key's owner over the authenticated action channel;
    // only its hash is stored.
    return { error: null, token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function revokeApiKeyAction(id: string): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await revokeApiKey(ctx, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function cancelMeetingAction(meetingId: string): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await cancelMeeting(ctx, meetingId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/settings");
  return { error: null };
}
