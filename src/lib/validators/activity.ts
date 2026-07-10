import { z } from "zod";

export const activitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "EMAIL", "SMS", "MEETING", "TASK"]),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  // datetime-local value, interpreted as Maldives time server-side
  dueAt: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  entityType: z.enum(["MERCHANT", "CONTACT", "DEAL"]),
  entityId: z.string().min(1),
});

export type ActivityInput = z.infer<typeof activitySchema>;
