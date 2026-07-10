import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const dealSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  merchantId: z.string().min(1, "Merchant is required"),
  contactId: optionalTrimmed,
  value: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 9_999_999_999) {
        ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    }),
  currency: z.enum(["MVR", "USD"]),
  // date input (yyyy-mm-dd), interpreted as MV date
  expectedCloseDate: optionalTrimmed,
  ownerId: optionalTrimmed, // admins only; reps own what they create
});

export type DealInput = z.infer<typeof dealSchema>;

export const DEAL_STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

export const moveDealSchema = z.object({
  dealId: z.string().min(1),
  stage: z.enum(DEAL_STAGES),
  lostReason: optionalTrimmed,
});

export const dealBoardParamsSchema = z.object({
  scope: z.enum(["all", "mine"]).default("all"),
});
