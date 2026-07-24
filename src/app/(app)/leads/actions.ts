"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LeadStatus } from "@prisma/client";

import { requireUserOrThrow } from "@/lib/rbac";
import { leadSchema } from "@/lib/validators/lead";
import {
  claimLead,
  convertLead,
  createLead,
  deleteLead,
  setLeadStatus,
  updateLead,
} from "@/services/leads";

export type LeadFormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
};

function field(formData: FormData, name: string) {
  return formData.get(name) ?? undefined;
}

function parseForm(formData: FormData) {
  return leadSchema.safeParse({
    source: field(formData, "source"),
    status: field(formData, "status"),
    name: field(formData, "name"),
    company: field(formData, "company"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    message: field(formData, "message"),
    merchantId: field(formData, "merchantId"),
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

export async function createLeadAction(
  _prev: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  try {
    await createLead(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/leads");
  redirect(`/leads?created=1`);
}

export async function updateLeadAction(
  id: string,
  _prev: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  try {
    await updateLead(ctx, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  redirect(`/leads/${id}`);
}

export async function setLeadStatusAction(id: string, status: LeadStatus) {
  const ctx = await requireUserOrThrow();
  await setLeadStatus(ctx, id, status);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

export async function claimLeadAction(id: string) {
  const ctx = await requireUserOrThrow();
  await claimLead(ctx, id);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

export async function deleteLeadAction(id: string) {
  const ctx = await requireUserOrThrow();
  await deleteLead(ctx, id);
  revalidatePath("/leads");
  redirect("/leads");
}

export async function convertLeadAction(id: string) {
  const ctx = await requireUserOrThrow();
  const { merchant } = await convertLead(ctx, id);
  revalidatePath("/leads");
  revalidatePath("/merchants");
  redirect(`/merchants/${merchant.id}`);
}
