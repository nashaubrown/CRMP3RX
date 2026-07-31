"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/rbac";
import { dealSchema, moveDealSchema } from "@/lib/validators/deal";
import { createActivity } from "@/services/activities";
import { createDeal, deleteDeal, moveDealStage, updateDeal } from "@/services/deals";

export type DealFormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
};

function field(formData: FormData, name: string) {
  return formData.get(name) ?? undefined;
}

function parseForm(formData: FormData) {
  return dealSchema.safeParse({
    title: field(formData, "title"),
    merchantId: field(formData, "merchantId"),
    contactId: field(formData, "contactId"),
    value: field(formData, "value"),
    currency: field(formData, "currency"),
    expectedCloseDate: field(formData, "expectedCloseDate"),
    ownerId: field(formData, "ownerId"),
  });
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createDealAction(
  _prev: DealFormState,
  formData: FormData
): Promise<DealFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  try {
    await createDeal(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/deals");
  redirect(`/deals?created=1`);
}

export async function updateDealAction(
  id: string,
  _prev: DealFormState,
  formData: FormData
): Promise<DealFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  try {
    await updateDeal(ctx, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  redirect(`/deals/${id}`);
}

export async function moveDealAction(input: {
  dealId: string;
  stage: string;
  lostReason?: string;
}): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  const parsed = moveDealSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid move" };

  try {
    await moveDealStage(ctx, parsed.data.dealId, parsed.data.stage, parsed.data.lostReason);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/deals");
  return { error: null };
}

export async function deleteDealAction(id: string) {
  const ctx = await requireUserOrThrow();
  await deleteDeal(ctx, id);
  revalidatePath("/deals");
  redirect("/deals");
}

// One-tap log: a rep sent the proposal to the merchant over WhatsApp. Advances
// the deal to Proposal (only from an earlier stage, never regressing) and logs
// an activity on the deal's timeline.
export async function logWhatsappProposalAction(
  dealId: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    const deal = await db.deal.findUnique({ where: { id: dealId }, select: { stage: true } });
    if (!deal) throw new Error("Deal not found");

    if (deal.stage === "NEW" || deal.stage === "QUALIFIED") {
      await moveDealStage(ctx, dealId, "PROPOSAL");
    }
    await createActivity(ctx, {
      type: "NOTE",
      subject: "Proposal sent via WhatsApp",
      entityType: "DEAL",
      entityId: dealId,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return { error: null };
}
