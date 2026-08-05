"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { affiliateSchema } from "@/lib/validators/affiliate";
import {
  AffiliateError,
  createAffiliate,
  setAffiliateActive,
  updateAffiliate,
} from "@/services/affiliates";

// Managing referral partners. These moved off the Settings page so the
// Affiliates section owns its own records; the service decides who may call
// them (the whole team for the partner records, admins for the payout ledger).

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
  payoutSchedule?: string;
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
  revalidatePath("/affiliates");
  return { error: null };
}
