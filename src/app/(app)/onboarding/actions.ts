"use server";

import { revalidatePath } from "next/cache";
import type { OnboardingOwnerRole, OnboardingStageKey } from "@prisma/client";

import { requireUser } from "@/lib/rbac";
import { parseMvLocal } from "@/lib/datetime";
import {
  addProjectTask,
  advanceStage,
  cancelOnboarding,
  OnboardingError,
  removeProjectTask,
  setBlocked,
  setProjectFields,
  setTaskDone,
  startOnboarding,
} from "@/services/onboarding";

type Result = { error?: string; id?: string };

function fail(e: unknown): Result {
  if (e instanceof OnboardingError) return { error: e.message };
  console.error("[onboarding] action failed", e);
  return { error: "Something went wrong. Try again." };
}

function refresh(projectId?: string) {
  revalidatePath("/onboarding");
  if (projectId) revalidatePath(`/onboarding/${projectId}`);
}

export async function startOnboardingAction(formData: FormData): Promise<Result> {
  try {
    const user = await requireUser();
    const merchantId = String(formData.get("merchantId") ?? "");
    if (!merchantId) return { error: "Pick a merchant." };
    const targetRaw = String(formData.get("targetLiveDate") ?? "").trim();
    const playbookId = String(formData.get("playbookId") ?? "").trim();

    const project = await startOnboarding(user, {
      merchantId,
      targetLiveDate: targetRaw ? parseMvLocal(targetRaw) : null,
      playbookId: playbookId || null,
    });
    refresh(project.id);
    return { id: project.id };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleTaskAction(taskId: string, done: boolean): Promise<Result> {
  try {
    const user = await requireUser();
    await setTaskDone(user, taskId, done);
    refresh();
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function addStepAction(projectId: string, formData: FormData): Promise<Result> {
  try {
    const user = await requireUser();
    const stage = String(formData.get("stage") ?? "") as OnboardingStageKey;
    const title = String(formData.get("title") ?? "");
    const ownerRole = String(formData.get("ownerRole") ?? "REP") as OnboardingOwnerRole;
    const dueRaw = String(formData.get("dueAt") ?? "").trim();
    await addProjectTask(user, projectId, {
      stage,
      title,
      ownerRole,
      dueAt: dueRaw ? parseMvLocal(dueRaw) : null,
    });
    refresh(projectId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function removeStepAction(projectId: string, taskId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await removeProjectTask(user, taskId);
    refresh(projectId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function advanceStageAction(
  projectId: string,
  skipReason?: string | null
): Promise<Result> {
  try {
    const user = await requireUser();
    await advanceStage(user, projectId, skipReason ?? null);
    refresh(projectId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function setBlockedAction(
  projectId: string,
  reason: string | null
): Promise<Result> {
  try {
    const user = await requireUser();
    await setBlocked(user, projectId, reason);
    refresh(projectId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function setTargetLiveDateAction(
  projectId: string,
  value: string
): Promise<Result> {
  try {
    const user = await requireUser();
    await setProjectFields(user, projectId, {
      targetLiveDate: value.trim() ? parseMvLocal(value.trim()) : null,
    });
    refresh(projectId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function reassignOnboardingAction(
  projectId: string,
  ownerId: string
): Promise<Result> {
  try {
    const user = await requireUser();
    await setProjectFields(user, projectId, { ownerId });
    refresh(projectId);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function cancelOnboardingAction(projectId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await cancelOnboarding(user, projectId);
    refresh(projectId);
    return {};
  } catch (e) {
    return fail(e);
  }
}
