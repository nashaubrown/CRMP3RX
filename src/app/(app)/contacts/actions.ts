"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUserOrThrow } from "@/lib/rbac";
import { contactSchema } from "@/lib/validators/contact";
import { createContact, deleteContact, updateContact } from "@/services/contacts";

export type ContactFormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  // Echoed back on error so a failed submit keeps what the user typed.
  values?: Record<string, string>;
};

// formData.get() returns null for absent fields; the schemas expect undefined.
function field(formData: FormData, name: string) {
  return formData.get(name) ?? undefined;
}

function rawValues(formData: FormData) {
  const out: Record<string, string> = {};
  for (const k of ["firstName", "lastName", "title", "email", "phone", "isPrimary"]) {
    const v = formData.get(k);
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseForm(formData: FormData) {
  return contactSchema.safeParse({
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    title: field(formData, "title"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    merchantIds: formData.getAll("merchantIds").map(String),
    isPrimary: field(formData, "isPrimary"),
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

export async function createContactAction(
  _prev: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
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
    const contact = await createContact(ctx, parsed.data);
    id = contact.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/contacts");
  for (const mId of parsed.data.merchantIds) revalidatePath(`/merchants/${mId}`);
  redirect(`/contacts/${id}`);
}

export async function updateContactAction(
  id: string,
  _prev: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
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
    await updateContact(ctx, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

export async function deleteContactAction(id: string) {
  const ctx = await requireUserOrThrow();
  await deleteContact(ctx, id);
  revalidatePath("/contacts");
  redirect("/contacts");
}
