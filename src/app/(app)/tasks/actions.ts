"use server";

import { revalidatePath } from "next/cache";
import type { TaskStatus } from "@prisma/client";

import { requireUserOrThrow } from "@/lib/rbac";
import { taskSchema } from "@/lib/validators/task";
import { createTask, deleteTask, moveTask, toggleTaskDone, updateTask } from "@/services/tasks";

export type TaskActionInput = {
  title: string;
  notes?: string;
  status?: string;
  priority?: string;
  dueAt?: string;
  assigneeId?: string;
  merchantId?: string;
  contactId?: string;
  dealId?: string;
};

function revalidateTaskViews(extra?: string) {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (extra) revalidatePath(extra);
}

export async function createTaskAction(
  input: TaskActionInput,
  revalidate?: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await createTask(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidateTaskViews(revalidate);
  return { error: null };
}

export async function updateTaskAction(
  id: string,
  input: TaskActionInput,
  revalidate?: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await updateTask(ctx, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidateTaskViews(revalidate);
  return { error: null };
}

export async function moveTaskAction(
  id: string,
  status: TaskStatus,
  revalidate?: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await moveTask(ctx, id, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidateTaskViews(revalidate);
  return { error: null };
}

export async function toggleTaskAction(
  id: string,
  revalidate?: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await toggleTaskDone(ctx, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidateTaskViews(revalidate);
  return { error: null };
}

export async function deleteTaskAction(
  id: string,
  revalidate?: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteTask(ctx, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidateTaskViews(revalidate);
  return { error: null };
}
