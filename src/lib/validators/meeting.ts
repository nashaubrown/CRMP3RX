import { z } from "zod";

export const scheduleMeetingSchema = z.object({
  entityType: z.enum(["MERCHANT", "CONTACT"]),
  entityId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  attendeeName: z.string().trim().min(1, "Attendee name is required").max(120),
  attendeeEmail: z.string().trim().email("Enter a valid email"),
  attendeePhone: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  // datetime-local value, interpreted as Maldives time server-side
  startAtLocal: z.string().min(1, "Pick a date and time"),
  durationMins: z.coerce.number().int().min(15).max(240),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export type ScheduleMeetingFormInput = z.infer<typeof scheduleMeetingSchema>;
