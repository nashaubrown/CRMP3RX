"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { isAdmin } from "@/lib/authz";
import {
  createTeamUser,
  resetTeamPassword,
  setTeamDisabled,
  setTeamRole,
  TeamError,
} from "@/services/users";

type Result = { error: string | null };

function toMessage(e: unknown): string {
  if (e instanceof TeamError) return e.message;
  // Zod and other errors: surface the first message without leaking internals.
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return "Something went wrong.";
}

async function requireAdminCtx() {
  const ctx = await requireUserOrThrow();
  if (!isAdmin(ctx)) throw new TeamError("Only admins can manage the team.");
  return ctx;
}

export async function createTeamUserAction(input: {
  name: string;
  email: string;
  role: "ADMIN" | "SALES_REP" | "DEVELOPER";
  password: string;
}): Promise<Result> {
  try {
    const ctx = await requireAdminCtx();
    await createTeamUser(ctx, input);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/team");
  return { error: null };
}

export async function setTeamRoleAction(
  userId: string,
  role: "ADMIN" | "SALES_REP" | "DEVELOPER"
): Promise<Result> {
  try {
    const ctx = await requireAdminCtx();
    await setTeamRole(ctx, { userId, role });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/team");
  return { error: null };
}

export async function resetTeamPasswordAction(
  userId: string,
  password: string
): Promise<Result> {
  try {
    const ctx = await requireAdminCtx();
    await resetTeamPassword(ctx, { userId, password });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/team");
  return { error: null };
}

export async function setTeamDisabledAction(
  userId: string,
  disabled: boolean
): Promise<Result> {
  try {
    const ctx = await requireAdminCtx();
    await setTeamDisabled(ctx, { userId, disabled });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/team");
  return { error: null };
}
