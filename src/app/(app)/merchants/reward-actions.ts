"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { curatedRewardSchema, curatedRewardStatusSchema } from "@/lib/validators/reward";
import { generateAiRewards } from "@/services/reward-ai";
import {
  addCuratedReward,
  deleteCuratedReward,
  RewardError,
  setCuratedRewardStatus,
  updateCuratedReward,
} from "@/services/rewards";

type Result = { error: string | null };

function toMessage(e: unknown): string {
  if (e instanceof RewardError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function saveCuratedRewardAction(
  merchantId: string,
  rewardId: string | null,
  input: unknown
): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = curatedRewardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid reward" };
  try {
    if (rewardId) await updateCuratedReward(ctx, rewardId, parsed.data);
    else await addCuratedReward(ctx, merchantId, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null };
}

export async function setCuratedRewardStatusAction(
  merchantId: string,
  rewardId: string,
  status: unknown
): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = curatedRewardStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status" };
  try {
    await setCuratedRewardStatus(ctx, rewardId, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null };
}

export async function deleteCuratedRewardAction(
  merchantId: string,
  rewardId: string
): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteCuratedReward(ctx, rewardId);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath(`/merchants/${merchantId}`);
  return { error: null };
}

export async function writeAiRewardsAction(
  merchantId: string
): Promise<Result & { written?: number }> {
  const ctx = await requireUserOrThrow();
  try {
    const res = await generateAiRewards(ctx, merchantId);
    revalidatePath(`/merchants/${merchantId}`);
    return { error: null, written: res.written };
  } catch (e) {
    return { error: toMessage(e) };
  }
}
