import { z } from "zod";

import { toE164 } from "@/lib/phone";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  title: optionalTrimmed,
  email: optionalTrimmed.pipe(z.string().email("Enter a valid email").optional()),
  phone: optionalTrimmed.transform((v, ctx) => {
    // A bare "+960" prefix (the prefilled default) counts as no phone.
    if (v === undefined || v.replace(/\s/g, "") === "+960") return undefined;
    const e164 = toE164(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number (e.g. +960 777 1234)" });
      return z.NEVER;
    }
    return e164;
  }),
  // One or more merchants this contact is tagged to. The first is the
  // "home" merchant (Contact.merchantId); the rest are additional tags.
  merchantIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .pipe(
      z
        .array(z.string().min(1))
        .min(1, "Select at least one merchant")
        // De-duplicate while preserving order (first selected = home merchant).
        .transform((ids) => Array.from(new Set(ids)))
    ),
  isPrimary: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const contactListParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  merchantId: z.string().optional(),
  // Follows the merchant's ownership/shares (hybrid sharing model)
  scope: z.enum(["all", "mine", "shared"]).default("all"),
  sort: z.enum(["name", "merchant", "updatedAt", "createdAt"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
});

export type ContactListParams = z.infer<typeof contactListParamsSchema>;
