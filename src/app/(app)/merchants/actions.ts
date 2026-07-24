"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUserOrThrow } from "@/lib/rbac";
import { merchantSchema } from "@/lib/validators/merchant";
import { removeMerchantShare, setMerchantShare } from "@/services/merchant-shares";
import { createMerchant, deleteMerchant, updateMerchant } from "@/services/merchants";

export type MerchantFormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  // Raw submitted values, echoed back on error so a failed submit doesn't wipe
  // what the user typed (React resets uncontrolled inputs after a form action).
  values?: Record<string, string>;
};

// formData.get() returns null for absent fields; the schemas expect undefined.
function field(formData: FormData, name: string) {
  return formData.get(name) ?? undefined;
}

const MERCHANT_FIELDS = [
  "name",
  "category",
  "status",
  "website",
  "phone",
  "email",
  "address",
  "notes",
  "posSystem",
  "monthlyTxnVolume",
  "subscriptionPlan",
  "branches",
  "loyaltyLive",
  "beta",
  "latitude",
  "longitude",
  "ownerId",
];

function rawValues(formData: FormData) {
  const out: Record<string, string> = {};
  for (const k of MERCHANT_FIELDS) {
    const v = formData.get(k);
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseForm(formData: FormData) {
  return merchantSchema.safeParse({
    name: field(formData, "name"),
    category: field(formData, "category"),
    status: field(formData, "status"),
    website: field(formData, "website"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    address: field(formData, "address"),
    notes: field(formData, "notes"),
    posSystem: field(formData, "posSystem"),
    monthlyTxnVolume: field(formData, "monthlyTxnVolume"),
    loyaltyLive: field(formData, "loyaltyLive"),
    subscriptionPlan: field(formData, "subscriptionPlan"),
    branches: field(formData, "branches"),
    beta: field(formData, "beta"),
    latitude: field(formData, "latitude"),
    longitude: field(formData, "longitude"),
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

export async function createMerchantAction(
  _prev: MerchantFormState,
  formData: FormData
): Promise<MerchantFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields",
      fieldErrors: toFieldErrors(parsed.error.issues),
      values: rawValues(formData),
    };
  }

  let id: string;
  try {
    const merchant = await createMerchant(ctx, parsed.data);
    id = merchant.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/merchants");
  redirect(`/merchants/${id}`);
}

export async function updateMerchantAction(
  id: string,
  _prev: MerchantFormState,
  formData: FormData
): Promise<MerchantFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields",
      fieldErrors: toFieldErrors(parsed.error.issues),
      values: rawValues(formData),
    };
  }

  try {
    await updateMerchant(ctx, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/merchants");
  revalidatePath(`/merchants/${id}`);
  redirect(`/merchants/${id}`);
}

export async function deleteMerchantAction(id: string) {
  const ctx = await requireUserOrThrow();
  await deleteMerchant(ctx, id);
  revalidatePath("/merchants");
  redirect("/merchants");
}

export async function setShareAction(
  merchantId: string,
  userId: string,
  permission: "VIEW" | "EDIT"
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await setMerchantShare(ctx, merchantId, userId, permission);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath("/merchants");
  return { error: null };
}

export async function removeShareAction(
  merchantId: string,
  userId: string
): Promise<{ error: string | null }> {
  const ctx = await requireUserOrThrow();
  try {
    await removeMerchantShare(ctx, merchantId, userId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath("/merchants");
  return { error: null };
}
