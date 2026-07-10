import { z } from "zod";

export const templateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    channel: z.enum(["EMAIL", "SMS"]),
    subject: z
      .string()
      .trim()
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    body: z.string().trim().min(1, "Body is required").max(10000),
  })
  .refine((data) => data.channel !== "EMAIL" || data.subject, {
    message: "Email templates need a subject",
    path: ["subject"],
  });

export type TemplateInput = z.infer<typeof templateSchema>;
