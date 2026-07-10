"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUserOrThrow } from "@/lib/rbac";
import { templateSchema } from "@/lib/validators/template";
import { createTemplate, deleteTemplate, updateTemplate } from "@/services/templates";

export type TemplateFormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
};

function parseForm(formData: FormData) {
  return templateSchema.safeParse({
    name: formData.get("name") ?? undefined,
    channel: formData.get("channel") ?? undefined,
    subject: formData.get("subject") ?? undefined,
    body: formData.get("body") ?? undefined,
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

export async function createTemplateAction(
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  try {
    await createTemplate(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/templates");
  redirect("/templates");
}

export async function updateTemplateAction(
  id: string,
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  try {
    await updateTemplate(ctx, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplateAction(id: string) {
  const ctx = await requireUserOrThrow();
  await deleteTemplate(ctx, id);
  revalidatePath("/templates");
  redirect("/templates");
}
