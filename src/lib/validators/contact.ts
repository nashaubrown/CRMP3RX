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
    if (v === undefined) return undefined;
    const e164 = toE164(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number (e.g. +960 777 1234)" });
      return z.NEVER;
    }
    return e164;
  }),
  merchantId: z.string().min(1, "Merchant is required"),
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
