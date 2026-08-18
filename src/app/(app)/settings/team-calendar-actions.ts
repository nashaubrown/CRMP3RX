"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { setTeamCalendarId, TeamCalendarError } from "@/services/team-calendar";

type Result = { error: string | null; cleared?: boolean };

export async function saveTeamCalendarAction(raw: unknown): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const value = typeof raw === "string" ? raw : "";
  try {
    const saved = await setTeamCalendarId(ctx, value);
    revalidatePath("/settings");
    return { error: null, cleared: saved === null };
  } catch (e) {
    if (e instanceof TeamCalendarError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
