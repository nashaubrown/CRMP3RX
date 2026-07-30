"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/rbac";
import {
  addOption,
  OptionSetError,
  renameOption,
  setOptionArchived,
  setOptionPricing,
} from "@/services/option-sets";
import { createApiKey, revokeApiKey } from "@/services/api-keys";
import {
  AffiliateError,
  createAffiliate,
  setAffiliateActive,
  updateAffiliate,
} from "@/services/affiliates";
import { affiliateSchema } from "@/lib/validators/affiliate";
import {
  clearAiSettings,
  saveAiSettings,
  saveAiSettingsSchema,
  testAiConnection,
} from "@/services/ai-settings";
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

export async function saveAiSettingsAction(
  input: unknown
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = saveAiSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await saveAiSettings(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function clearAiSettingsAction(): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await clearAiSettings(ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function testAiConnectionAction(): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireUserOrThrow();
  return testAiConnection(ctx);
}

function optionSetError(e: unknown): string {
  if (e instanceof OptionSetError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return "Something went wrong.";
}

export async function addOptionAction(
  setKey: string,
  label: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await addOption(ctx, setKey, label);
  } catch (e) {
    return { error: optionSetError(e) };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function renameOptionAction(
  id: string,
  label: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await renameOption(ctx, id, label);
  } catch (e) {
    return { error: optionSetError(e) };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function setOptionArchivedAction(
  id: string,
  archived: boolean
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await setOptionArchived(ctx, id, archived);
  } catch (e) {
    return { error: optionSetError(e) };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function setOptionPricingAction(
  id: string,
  priceMvr: number | null,
  perLocation: boolean
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await setOptionPricing(ctx, id, priceMvr, perLocation);
  } catch (e) {
    return { error: optionSetError(e) };
  }
  revalidatePath("/settings");
  return { error: null };
}

function affiliateError(e: unknown): string {
  if (e instanceof AffiliateError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return "Something went wrong.";
}

export type AffiliateFormInput = {
  name: string;
  email?: string;
  phone?: string;
  commissionRate: string | number;
};

export async function createAffiliateAction(
  input: AffiliateFormInput
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = affiliateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await createAffiliate(ctx, parsed.data);
  } catch (e) {
    return { error: affiliateError(e) };
  }
  revalidatePath("/settings");
  revalidatePath("/affiliates");
  return { error: null };
}

export async function updateAffiliateAction(
  id: string,
  input: AffiliateFormInput
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = affiliateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await updateAffiliate(ctx, id, parsed.data);
  } catch (e) {
    return { error: affiliateError(e) };
  }
  revalidatePath("/settings");
  revalidatePath("/affiliates");
  return { error: null };
}

export async function setAffiliateActiveAction(
  id: string,
  active: boolean
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await setAffiliateActive(ctx, id, active);
  } catch (e) {
    return { error: affiliateError(e) };
  }
  revalidatePath("/settings");
  revalidatePath("/affiliates");
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
