import { z } from "zod";

import { toE164 } from "@/lib/phone";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const affiliateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
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
  commissionRate: z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      if (v === "" || v === null || v === undefined) return 0;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "Commission must be between 0 and 100 (%)" });
        return z.NEVER;
      }
      // Keep at most two decimals.
      return Math.round(n * 100) / 100;
    }),
});

export type AffiliateInput = z.infer<typeof affiliateSchema>;
