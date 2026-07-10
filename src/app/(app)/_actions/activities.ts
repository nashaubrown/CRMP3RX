"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { activitySchema } from "@/lib/validators/activity";
import {
  createActivity,
  deleteActivity,
  toggleActivityComplete,
} from "@/services/activities";

export type ActivityFormState = { error: string | null; success?: boolean };

function safeRevalidate(path: FormDataEntryValue | null) {
  if (typeof path === "string" && path.startsWith("/")) revalidatePath(path);
}

export async function createActivityAction(
  _prev: ActivityFormState,
  formData: FormData
): Promise<ActivityFormState> {
  const ctx = await requireUserOrThrow();

  // formData.get() returns null for absent fields; the schema expects undefined.
  const parsed = activitySchema.safeParse({
    type: formData.get("type") ?? undefined,
    subject: formData.get("subject") ?? undefined,
    body: formData.get("body") ?? undefined,
    dueAt: formData.get("dueAt") ?? undefined,
    entityType: formData.get("entityType") ?? undefined,
    entityId: formData.get("entityId") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await createActivity(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  safeRevalidate(formData.get("revalidate"));
  return { error: null, success: true };
}

export async function toggleActivityCompleteAction(id: string, revalidate: string) {
  const ctx = await requireUserOrThrow();
  await toggleActivityComplete(ctx, id);
  if (revalidate.startsWith("/")) revalidatePath(revalidate);
}

export async function deleteActivityAction(id: string, revalidate: string) {
  const ctx = await requireUserOrThrow();
  await deleteActivity(ctx, id);
  if (revalidate.startsWith("/")) revalidatePath(revalidate);
}
