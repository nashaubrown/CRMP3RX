"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { geofenceSchema } from "@/lib/validators/geofence";
import {
  createGeofence,
  deleteGeofence,
  GeofenceError,
  updateGeofence,
} from "@/services/geofences";

type Result = { error: string | null };

function toMessage(e: unknown): string {
  if (e instanceof GeofenceError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return "Something went wrong.";
}

export async function saveGeofenceAction(id: string | null, input: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = geofenceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid zone" };
  try {
    if (id) await updateGeofence(ctx, id, parsed.data);
    else await createGeofence(ctx, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/zones");
  return { error: null };
}

export async function deleteGeofenceAction(id: string): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteGeofence(ctx, id);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/zones");
  return { error: null };
}
