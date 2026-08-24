"use server";

import { revalidatePath } from "next/cache";
import type { OnboardingOwnerRole, OnboardingStageKey } from "@prisma/client";

import { requireUser } from "@/lib/rbac";
import {
  addPlaybookTask,
  createPlaybook,
  duplicatePlaybook,
  OnboardingError,
  removePlaybookTask,
  updatePlaybook,
  updatePlaybookTask,
} from "@/services/onboarding";

type Result = { error?: string; id?: string };

function fail(e: unknown): Result {
  if (e instanceof OnboardingError) return { error: e.message };
  console.error("[playbooks] action failed", e);
  return { error: "Something went wrong. Try again." };
}

function refresh() {
  revalidatePath("/onboarding/playbooks");
  revalidatePath("/onboarding");
}

export async function createPlaybookAction(formData: FormData): Promise<Result> {
  try {
    const user = await requireUser();
    const playbook = await createPlaybook(user, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      planLabel: String(formData.get("planLabel") ?? ""),
    });
    refresh();
    return { id: playbook.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePlaybookAction(
  playbookId: string,
  fields: { name?: string; description?: string; planLabel?: string; isDefault?: boolean; archived?: boolean }
): Promise<Result> {
  try {
    const user = await requireUser();
    await updatePlaybook(user, playbookId, fields);
    refresh();
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function duplicatePlaybookAction(
  playbookId: string,
  name: string
): Promise<Result> {
  try {
    const user = await requireUser();
    const copy = await duplicatePlaybook(user, playbookId, name);
    refresh();
    return { id: copy.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addPlaybookStepAction(
  playbookId: string,
  formData: FormData
): Promise<Result> {
  try {
    const user = await requireUser();
    await addPlaybookTask(user, playbookId, {
      stage: String(formData.get("stage") ?? "") as OnboardingStageKey,
      title: String(formData.get("title") ?? ""),
      ownerRole: String(formData.get("ownerRole") ?? "REP") as OnboardingOwnerRole,
      dueOffsetDays: Number(formData.get("dueOffsetDays") ?? 0) || 0,
    });
    refresh();
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function updatePlaybookStepAction(
  taskId: string,
  fields: { title?: string; ownerRole?: OnboardingOwnerRole; dueOffsetDays?: number }
): Promise<Result> {
  try {
    const user = await requireUser();
    await updatePlaybookTask(user, taskId, fields);
    refresh();
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function removePlaybookStepAction(taskId: string): Promise<Result> {
  try {
    const user = await requireUser();
    await removePlaybookTask(user, taskId);
    refresh();
    return {};
  } catch (e) {
    return fail(e);
  }
}
