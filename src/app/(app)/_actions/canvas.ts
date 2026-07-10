"use server";

import { requireUserOrThrow } from "@/lib/rbac";
import { db } from "@/lib/db";
import { runCanvasAction } from "@/services/canvas";

export type CanvasActionResult = { ok: boolean; message: string };

// Runs an inline action from a generated view. All RBAC/edit-rights checks
// happen inside runCanvasAction -> services layer.
export async function runCanvasActionAction(action: unknown): Promise<CanvasActionResult> {
  const ctx = await requireUserOrThrow();
  try {
    return await runCanvasAction(ctx, action);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Action failed" };
  }
}

// Persists the per-user Classic/Generative UI preference.
export async function setUiModeAction(generative: boolean): Promise<{ ok: boolean }> {
  const ctx = await requireUserOrThrow();
  await db.user.update({ where: { id: ctx.id }, data: { generativeUi: generative } });
  return { ok: true };
}
