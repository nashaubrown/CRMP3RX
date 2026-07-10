import { z } from "zod";

import { toE164 } from "@/lib/phone";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalPhone = optionalTrimmed.transform((v, ctx) => {
  if (v === undefined) return undefined;
  const e164 = toE164(v);
  if (!e164) {
    ctx.addIssue({ code: "custom", message: "Enter a valid phone number (e.g. +960 777 1234)" });
    return z.NEVER;
  }
  return e164;
});

export const LEAD_SOURCES = ["WEBSITE", "REFERRAL", "EVENT", "COLD_OUTREACH", "OTHER"] as const;

// Internal create/edit form
export const leadSchema = z.object({
  source: z.enum(LEAD_SOURCES),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"]).default("NEW"),
  name: optionalTrimmed,
  company: optionalTrimmed,
  email: optionalTrimmed.pipe(z.string().email("Enter a valid email").optional()),
  phone: optionalPhone,
  message: optionalTrimmed,
  merchantId: optionalTrimmed,
});

export type LeadInput = z.infer<typeof leadSchema>;

// Public capture form (stricter: needs a name and a way to reach back)
export const leadCaptureSchema = z
  .object({
    name: z.string().trim().min(1, "Your name is required").max(200),
    company: z.string().trim().min(1, "Business name is required").max(200),
    email: optionalTrimmed.pipe(z.string().email("Enter a valid email").optional()),
    phone: optionalPhone,
    message: optionalTrimmed.pipe(z.string().max(2000).optional()),
    // Honeypot: real users never fill this
    website: z.string().max(0, "Invalid submission").optional().or(z.literal("")),
  })
  .refine((data) => data.email || data.phone, {
    message: "Provide an email or a phone number so we can reach you",
    path: ["email"],
  });

export type LeadCaptureInput = z.infer<typeof leadCaptureSchema>;

export const leadListParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"]).optional(),
  scope: z.enum(["all", "mine", "unassigned"]).default("all"),
  sort: z.enum(["score", "createdAt", "updatedAt"]).default("score"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
});

export type LeadListParams = z.infer<typeof leadListParamsSchema>;
