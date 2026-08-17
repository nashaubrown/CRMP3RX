import { z } from "zod";

import { devProductSchema } from "@/lib/validators/dev-ticket";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const roadmapStageSchema = z.enum([
  "SUGGESTED",
  "CONSIDERING",
  "PLANNED",
  "IN_DEVELOPMENT",
  "SHIPPED",
  "DECLINED",
]);

const score = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const roadmapItemSchema = z.object({
  title: z.string().trim().min(1, "Give the idea a name").max(200),
  description: optionalTrimmed,
  product: devProductSchema,
});

export const roadmapItemUpdateSchema = roadmapItemSchema.extend({
  // "" clears a score back to unset.
  effort: z
    .union([score, z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  impact: z
    .union([score, z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullish(),
});

export const roadmapCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(5000),
});

export const roadmapDemandSchema = z.object({
  merchantId: z.string().trim().min(1, "Pick a merchant"),
  note: optionalTrimmed,
});
