"use server";

import { revalidatePath } from "next/cache";

import { requireUserOrThrow } from "@/lib/rbac";
import { outletSchema } from "@/lib/validators/outlet";
import { addOutlet, deleteOutlet, OutletError, updateOutlet } from "@/services/outlets";

type Result = { error: string | null };

function toMessage(e: unknown): string {
  if (e instanceof OutletError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function saveOutletAction(
  merchantId: string,
  outletId: string | null,
  input: unknown
): Promise<Result> {
  const ctx = await requireUserOrThrow();
  const parsed = outletSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid outlet" };
  try {
    if (outletId) await updateOutlet(ctx, outletId, parsed.data);
    else await addOutlet(ctx, merchantId, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath("/merchants");
  return { error: null };
}

export async function deleteOutletAction(merchantId: string, outletId: string): Promise<Result> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteOutlet(ctx, outletId);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath("/merchants");
  return { error: null };
}
