"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { rewardTemplateSchema } from "@/lib/validators/reward";
import {
  archiveRewardTemplate,
  createRewardTemplate,
  RewardError,
  updateRewardTemplate,
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

export async function saveRewardTemplateAction(
  templateId: string | null,
  input: unknown
): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = rewardTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid template" };
  try {
    if (templateId) await updateRewardTemplate(ctx, templateId, parsed.data);
    else await createRewardTemplate(ctx, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function setRewardTemplateArchivedAction(
  templateId: string,
  archived: boolean
): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await archiveRewardTemplate(ctx, templateId, archived);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/settings");
  return { error: null };
}
