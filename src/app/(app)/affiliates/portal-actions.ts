"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import {
  approveApplicationSchema,
  rejectApplicationSchema,
  termsSettingSchema,
} from "@/lib/validators/affiliate-portal";
import {
  AffiliatePortalError,
  approveApplication,
  rejectApplication,
  revealBankAccount,
  saveTermsSetting,
} from "@/services/affiliate-portal";

// Server actions for the affiliate-portal admin surfaces (Applications queue,
// terms editor, bank reveal). All ADMIN-only — enforced in the service layer.

function toError(e: unknown): string {
  if (e instanceof AffiliatePortalError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function approveApplicationAction(
  affiliateId: string,
  input: { commissionRate: string | number; payoutSchedule: string }
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = approveApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await approveApplication(ctx, affiliateId, parsed.data);
    revalidatePath("/affiliates");
    return { error: null };
  } catch (e) {
    return { error: toError(e) };
  }
}

export async function rejectApplicationAction(
  affiliateId: string,
  note: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = rejectApplicationSchema.safeParse({ note });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await rejectApplication(ctx, affiliateId, parsed.data.note);
    revalidatePath("/affiliates");
    return { error: null };
  } catch (e) {
    return { error: toError(e) };
  }
}

export async function revealBankAccountAction(
  affiliateId: string
): Promise<{ error: string | null; accountNumber?: string }> {
  const ctx = await requireUserOrThrow();
  try {
    const accountNumber = await revealBankAccount(ctx, affiliateId);
    return { error: null, accountNumber };
  } catch (e) {
    return { error: toError(e) };
  }
}

export async function saveTermsAction(input: {
  version: string;
  bodyHtml: string;
}): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = termsSettingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await saveTermsSetting(ctx, parsed.data);
    revalidatePath("/affiliates");
    return { error: null };
  } catch (e) {
    return { error: toError(e) };
  }
}
