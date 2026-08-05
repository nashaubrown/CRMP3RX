import { z } from "zod";

import { toE164 } from "@/lib/phone";

// Validation for the affiliate portal API (/api/affiliate/*). Registration is
// public input from not-necessarily-tech-savvy applicants on phones, so the
// rules are deliberately forgiving: trim everything, validate loosely, and
// keep messages plain.

const requiredTrimmed = z.string().trim().min(1, "This field is required");

const requiredPhone = requiredTrimmed.transform((v, ctx) => {
  const e164 = toE164(v);
  if (!e164) {
    ctx.addIssue({ code: "custom", message: "Enter a valid phone number (e.g. +960 777 1234)" });
    return z.NEVER;
  }
  return e164;
});

const email = z.string().trim().toLowerCase().pipe(z.string().email("Enter a valid email"));

// Maldivian national ID: letter(s) + digits (e.g. "A123456"). Validated
// loosely on purpose — a human admin checks it against the uploaded document.
const ID_CARD_RE = /^[A-Za-z]{1,2}\d{4,7}$/;

export const MALDIVES_BANKS = [
  "Bank of Maldives",
  "Maldives Islamic Bank",
  "Mauritius Commercial Bank",
  "HSBC",
  "State Bank of India",
] as const;

export const registerStartSchema = z.object({
  fullName: requiredTrimmed.pipe(z.string().max(120, "Name is too long")),
  email,
  phone: requiredPhone,
});
export type RegisterStartInput = z.infer<typeof registerStartSchema>;

export const registerVerifyEmailSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});
export type RegisterVerifyEmailInput = z.infer<typeof registerVerifyEmailSchema>;

const bankFields = {
  bankName: requiredTrimmed.pipe(z.string().max(80, "Bank name is too long")),
  bankAccountName: requiredTrimmed.pipe(z.string().max(120, "Account holder name is too long")),
  bankAccountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6,20}$/, "Enter the account number (digits only)")),
};

// Non-file fields of the final registration submit (multipart).
export const submitApplicationSchema = z.object({
  draftToken: requiredTrimmed,
  idCardNumber: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(ID_CARD_RE, "Enter your ID card number (e.g. A123456)")),
  ...bankFields,
  tcVersion: requiredTrimmed,
  agree: z.literal("true", { error: "You must agree to the Terms & Conditions" }),
});
export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;

export const requestLinkSchema = z.object({ email });

export const verifyTokenSchema = z.object({ token: requiredTrimmed });

export const patchMeSchema = z.object({ emailNotifications: z.boolean() });

export const bankApplyChangeSchema = z.object({
  token: requiredTrimmed,
  ...bankFields,
});
export type BankApplyChangeInput = z.infer<typeof bankApplyChangeSchema>;

// Portal-facing merchant statuses — friendly labels, never raw CRM enums.
export const PORTAL_MERCHANT_STATUSES = [
  "EARNING",
  "ONBOARDING",
  "IN_PROGRESS",
  "INACTIVE",
] as const;
export type PortalMerchantStatus = (typeof PORTAL_MERCHANT_STATUSES)[number];

export const portalMerchantsParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(PORTAL_MERCHANT_STATUSES).optional(),
  sort: z.enum(["referredAt", "name"]).default("referredAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
});
export type PortalMerchantsParams = z.infer<typeof portalMerchantsParamsSchema>;

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const portalReferralSchema = z
  .object({
    businessName: requiredTrimmed.pipe(z.string().max(200, "Business name is too long")),
    contactPerson: optionalTrimmed.pipe(z.string().max(200).optional()),
    email: optionalTrimmed.pipe(z.string().email("Enter a valid email").optional()),
    phone: optionalTrimmed.transform((v, ctx) => {
      if (v === undefined) return undefined;
      const e164 = toE164(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number" });
        return z.NEVER;
      }
      return e164;
    }),
    note: optionalTrimmed.pipe(z.string().max(2000).optional()),
  })
  .refine((data) => data.email || data.phone, {
    message: "Add an email or phone number so the Perx team can reach them",
    path: ["email"],
  });
export type PortalReferralInput = z.infer<typeof portalReferralSchema>;

// Admin review actions (CRM UI)
export const approveApplicationSchema = z.object({
  commissionRate: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n > 0 && n <= 100, {
      message: "Commission must be between 0 and 100 (%)",
    })
    .transform((n) => Math.round(n * 100) / 100),
  payoutSchedule: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
});
export type ApproveApplicationInput = z.infer<typeof approveApplicationSchema>;

export const rejectApplicationSchema = z.object({
  note: optionalTrimmed.pipe(z.string().max(1000).optional()),
});

export const termsSettingSchema = z.object({
  version: requiredTrimmed.pipe(z.string().max(40, "Keep the version short (e.g. 2026-08-01)")),
  bodyHtml: z.string().trim().min(1, "Terms text is required"),
});
export type TermsSettingInput = z.infer<typeof termsSettingSchema>;
