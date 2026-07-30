"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import {
  AffiliateError,
  recordCommissionsForPeriod,
  setCommissionStatus,
} from "@/services/affiliates";

function toError(e: unknown): string {
  if (e instanceof AffiliateError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function recordCommissionsAction(
  period: string
): Promise<{ error: string | null; summary?: string }> {
  const ctx = await requireUserOrThrow();
  try {
    const { recorded, updated, skippedPaid } = await recordCommissionsForPeriod(ctx, period);
    const parts: string[] = [];
    if (recorded) parts.push(`${recorded} recorded`);
    if (updated) parts.push(`${updated} updated`);
    if (skippedPaid) parts.push(`${skippedPaid} already paid`);
    revalidatePath("/affiliates");
    return { error: null, summary: parts.length ? parts.join(", ") : "Nothing to record" };
  } catch (e) {
    return { error: toError(e) };
  }
}

export async function setCommissionStatusAction(
  id: string,
  status: "PENDING" | "PAID"
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await setCommissionStatus(ctx, id, status);
  } catch (e) {
    return { error: toError(e) };
  }
  revalidatePath("/affiliates");
  return { error: null };
}
