"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import {
  assignPermissionSet,
  deletePermissionSet,
  PermissionError,
  savePermissionSet,
  setDefaultPermissionSet,
  type PermissionSetInput,
} from "@/services/permissions";

function message(e: unknown): string {
  if (e instanceof PermissionError) return e.message;
  if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
    return "A permission set with that name already exists.";
  }
  return "Something went wrong.";
}

export async function savePermissionSetAction(
  id: string | null,
  input: PermissionSetInput
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await savePermissionSet(ctx, id, input);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/team");
  return { error: null };
}

export async function deletePermissionSetAction(id: string): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await deletePermissionSet(ctx, id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/team");
  return { error: null };
}

export async function setDefaultPermissionSetAction(id: string): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await setDefaultPermissionSet(ctx, id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/team");
  return { error: null };
}

export async function assignPermissionSetAction(
  userId: string,
  permissionSetId: string | null
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await assignPermissionSet(ctx, userId, permissionSetId);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/team");
  return { error: null };
}
