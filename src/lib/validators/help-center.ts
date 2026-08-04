import { z } from "zod";

export const helpArticleMetaSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only"),
  description: z.string().trim().max(200).default(""),
  categoryId: z.string().min(1, "Pick a category"),
  order: z.coerce.number().int().min(0).max(999).default(99),
});

export type HelpArticleMetaInput = z.infer<typeof helpArticleMetaSchema>;

// Plate content is an array of nodes; structure is validated loosely here
// (the editor produces it) and rendering is hardened in help-html.ts.
export const helpContentSchema = z.array(z.record(z.string(), z.unknown())).min(1);

export const helpCategorySchema = z.object({
  title: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only"),
  description: z.string().trim().max(200).default(""),
  icon: z.string().trim().max(30).default("chart"),
  order: z.coerce.number().int().min(0).max(999).default(99),
});

export type HelpCategoryInput = z.infer<typeof helpCategorySchema>;

export const helpSettingsSchema = z.object({
  netlifyBuildHookUrl: z
    .string()
    .trim()
    .url("Must be a URL")
    .startsWith("https://", "Must be https")
    .or(z.literal(""))
    .default(""),
  siteUrl: z
    .string()
    .trim()
    .url("Must be a URL")
    .or(z.literal(""))
    .default(""),
});
