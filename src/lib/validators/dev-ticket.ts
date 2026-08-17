import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const devTicketTypeSchema = z.enum(["BUG", "FEATURE", "IMPROVEMENT"]);
export const devProductSchema = z.enum(["MERCHANT_PORTAL", "PERX_APP", "CRM"]);
export const devTicketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const devTicketStatusSchema = z.enum([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
  "WONT_DO",
]);

export const devTicketSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalTrimmed,
  type: devTicketTypeSchema,
  product: devProductSchema,
  priority: devTicketPrioritySchema.default("MEDIUM"),
  merchantId: optionalTrimmed,
  assigneeId: optionalTrimmed,
});

export type DevTicketInput = z.infer<typeof devTicketSchema>;

export const devTicketCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(5000),
});

// Screenshots are how bugs actually get reported; PDFs cover exported logs.
export const DEV_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DEV_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];
