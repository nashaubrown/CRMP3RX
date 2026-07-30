import { z } from "zod";

import { toE164 } from "@/lib/phone";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const merchantSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: optionalTrimmed,
  status: z.enum(["PROSPECT", "ACTIVE", "CHURNED"]),
  website: optionalTrimmed.pipe(z.string().url("Enter a valid URL (https://…)").optional()),
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
  email: optionalTrimmed.pipe(z.string().email("Enter a valid email").optional()),
  address: optionalTrimmed,
  notes: optionalTrimmed,
  posSystem: optionalTrimmed,
  monthlyTxnVolume: optionalTrimmed.transform((v, ctx) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Must be a whole number, 0 or more" });
      return z.NEVER;
    }
    return n;
  }),
  subscriptionPlan: optionalTrimmed,
  branches: optionalTrimmed.transform((v, ctx) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Must be a whole number, 0 or more" });
      return z.NEVER;
    }
    return n;
  }),
  loyaltyLive: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
  beta: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
  latitude: optionalTrimmed.transform((v, ctx) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < -90 || n > 90) {
      ctx.addIssue({ code: "custom", message: "Latitude must be between -90 and 90" });
      return z.NEVER;
    }
    return n;
  }),
  longitude: optionalTrimmed.transform((v, ctx) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < -180 || n > 180) {
      ctx.addIssue({ code: "custom", message: "Longitude must be between -180 and 180" });
      return z.NEVER;
    }
    return n;
  }),
  // Only honored for admins; reps always own what they create.
  ownerId: optionalTrimmed,
  // Referring affiliate (id). Optional — most merchants have none.
  affiliateId: optionalTrimmed,
});

export type MerchantInput = z.infer<typeof merchantSchema>;

export const merchantListParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "CHURNED"]).optional(),
  owner: z.string().trim().min(1).optional(),
  affiliate: z.string().trim().min(1).optional(),
  scope: z.enum(["all", "mine", "shared"]).default("all"),
  sort: z.enum(["name", "status", "category", "updatedAt", "createdAt"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
});

export type MerchantListParams = z.infer<typeof merchantListParamsSchema>;
