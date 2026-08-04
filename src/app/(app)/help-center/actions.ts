"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUserOrThrow } from "@/lib/rbac";
import {
  helpArticleMetaSchema,
  helpCategorySchema,
  helpContentSchema,
  helpSettingsSchema,
} from "@/lib/validators/help-center";
import type { PlateNode } from "@/lib/help-html";
import { importFromHelpSite } from "@/services/help-import";
import {
  HelpCenterError,
  createHelpArticle,
  createHelpCategory,
  deleteHelpArticle,
  deleteHelpCategory,
  publishHelpArticle,
  rejectHelpArticle,
  submitForReview,
  triggerSiteBuild,
  unpublishHelpArticle,
  updateHelpArticle,
  updateHelpCategory,
  updateHelpSettings,
} from "@/services/help-center";

export type HelpFormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function message(e: unknown): string {
  if (e instanceof HelpCenterError) return e.message;
  return "Something went wrong";
}

function parseMeta(formData: FormData) {
  return helpArticleMetaSchema.safeParse({
    title: formData.get("title") ?? undefined,
    slug: formData.get("slug") ?? undefined,
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId") ?? undefined,
    order: formData.get("order") ?? 99,
  });
}

export async function createArticleAction(
  _prev: HelpFormState,
  formData: FormData
): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseMeta(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  let id: string;
  try {
    const article = await createHelpArticle(ctx, parsed.data);
    id = article.id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center");
  redirect(`/help-center/${id}`);
}

export async function saveArticleAction(
  id: string,
  meta: {
    title: string;
    slug: string;
    description: string;
    categoryId: string;
    order: number;
  },
  contentJson: unknown
): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  const parsedMeta = helpArticleMetaSchema.safeParse(meta);
  if (!parsedMeta.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsedMeta.error.issues) };
  }
  const parsedContent = helpContentSchema.safeParse(contentJson);
  if (!parsedContent.success) {
    return { error: "Article content is empty or invalid" };
  }
  try {
    await updateHelpArticle(ctx, id, parsedMeta.data, parsedContent.data as PlateNode[]);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center");
  revalidatePath(`/help-center/${id}`);
  return { error: null, ok: true };
}

export async function submitForReviewAction(id: string): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  try {
    await submitForReview(ctx, id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center");
  revalidatePath(`/help-center/${id}`);
  return { error: null, ok: true };
}

export async function publishArticleAction(id: string): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  try {
    await publishHelpArticle(ctx, id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center");
  revalidatePath(`/help-center/${id}`);
  return { error: null, ok: true };
}

export async function rejectArticleAction(id: string, note: string): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  try {
    await rejectHelpArticle(ctx, id, note);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center");
  revalidatePath(`/help-center/${id}`);
  return { error: null, ok: true };
}

export async function unpublishArticleAction(id: string): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  try {
    await unpublishHelpArticle(ctx, id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center");
  revalidatePath(`/help-center/${id}`);
  return { error: null, ok: true };
}

export async function deleteArticleAction(id: string): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteHelpArticle(ctx, id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center");
  redirect("/help-center");
}

// ---------- Categories ----------

function parseCategory(formData: FormData) {
  return helpCategorySchema.safeParse({
    title: formData.get("title") ?? undefined,
    slug: formData.get("slug") ?? undefined,
    description: formData.get("description") ?? "",
    icon: formData.get("icon") ?? "chart",
    order: formData.get("order") ?? 99,
  });
}

export async function createCategoryAction(
  _prev: HelpFormState,
  formData: FormData
): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseCategory(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  try {
    await createHelpCategory(ctx, parsed.data);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center/settings");
  return { error: null, ok: true };
}

export async function updateCategoryAction(
  id: string,
  _prev: HelpFormState,
  formData: FormData
): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = parseCategory(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  try {
    await updateHelpCategory(ctx, id, parsed.data);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center/settings");
  return { error: null, ok: true };
}

export async function deleteCategoryAction(id: string): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  try {
    await deleteHelpCategory(ctx, id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center/settings");
  return { error: null, ok: true };
}

// ---------- Settings ----------

export async function saveHelpSettingsAction(
  _prev: HelpFormState,
  formData: FormData
): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  const parsed = helpSettingsSchema.safeParse({
    netlifyBuildHookUrl: formData.get("netlifyBuildHookUrl") ?? "",
    siteUrl: formData.get("siteUrl") ?? "",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields", fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  try {
    await updateHelpSettings(ctx, parsed.data);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/help-center/settings");
  return { error: null, ok: true };
}

export async function rebuildSiteAction(): Promise<HelpFormState> {
  await requireUserOrThrow();
  const ok = await triggerSiteBuild();
  return ok
    ? { error: null, ok: true }
    : { error: "No build hook configured, or the hook call failed" };
}

export async function importFromHelpSiteAction(url: string): Promise<HelpFormState> {
  const ctx = await requireUserOrThrow();
  try {
    const res = await importFromHelpSite(ctx, url);
    revalidatePath("/help-center");
    revalidatePath("/help-center/settings");
    return {
      error: null,
      ok: true,
      fieldErrors: undefined,
      // Reuse error slot pattern: summary via toast on the client instead.
    };
  } catch (e) {
    return { error: message(e) };
  }
}
