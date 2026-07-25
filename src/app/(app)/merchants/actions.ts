"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUserOrThrow } from "@/lib/rbac";
import { contactSchema, type ContactInput } from "@/lib/validators/contact";
import { merchantSchema } from "@/lib/validators/merchant";
import { createContact } from "@/services/contacts";
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

// Optional inline contacts submitted with a new merchant (JSON from the form).
// Validated up front so a bad contact never leaves an orphaned merchant. The
// merchant id is injected at creation time.
function parseInlineContacts(formData: FormData): { data: ContactInput[]; error?: string } {
  const raw = formData.get("contactsJson");
  if (typeof raw !== "string" || !raw) return { data: [] };
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return { data: [] };
  }
  if (!Array.isArray(rows)) return { data: [] };

  const out: ContactInput[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] ?? {}) as Record<string, unknown>;
    // A bare "+960" prefix with no number counts as no phone.
    const phone =
      typeof r.phone === "string" && r.phone.replace(/\s/g, "") === "+960" ? "" : r.phone;
    const parsed = contactSchema.safeParse({
      firstName: r.firstName,
      lastName: r.lastName,
      title: r.title,
      email: r.email,
      phone,
      merchantIds: ["_"], // placeholder; replaced with the new merchant id
      isPrimary: r.isPrimary,
    });
    if (!parsed.success) {
      return { data: [], error: `Contact ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}` };
    }
    out.push(parsed.data);
  }
  return { data: out };
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

  // Validate any inline contacts before creating anything.
  const contacts = parseInlineContacts(formData);
  if (contacts.error) {
    return { error: contacts.error, values: rawValues(formData) };
  }

  try {
    const merchant = await createMerchant(ctx, parsed.data);
    for (const c of contacts.data) {
      await createContact(ctx, { ...c, merchantIds: [merchant.id] });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/merchants");
  revalidatePath("/contacts");
  // Back to the list (with a success flash) so reps can add several in a row.
  redirect(`/merchants?created=1`);
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
