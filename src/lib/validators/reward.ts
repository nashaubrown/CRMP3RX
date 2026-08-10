import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const rewardMechanicSchema = z.enum([
  "STAMP_CARD",
  "DISCOUNT",
  "FREE_ITEM",
  "TIME_LIMITED",
]);

export const curatedRewardStatusSchema = z.enum(["IDEA", "PITCHED", "ACCEPTED", "DECLINED"]);

export const rewardTemplateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalTrimmed,
  mechanic: rewardMechanicSchema,
  category: optionalTrimmed,
});

export type RewardTemplateInput = z.infer<typeof rewardTemplateSchema>;

// title/mechanic are optional at the edge because "add from library" sends
// only a templateId — the service copies the template's wording in.
export const curatedRewardSchema = z.object({
  templateId: optionalTrimmed,
  title: z.string().trim().max(200).optional().default(""),
  description: optionalTrimmed,
  mechanic: rewardMechanicSchema.optional(),
  notes: optionalTrimmed,
});

export type CuratedRewardInput = z.infer<typeof curatedRewardSchema>;
