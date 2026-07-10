"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { formatDateTime } from "@/lib/datetime";
import { toE164 } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { bookMeeting } from "@/services/scheduling";

const bookingSchema = z.object({
  slug: z.string().min(1),
  startAtIso: z.string().min(1),
  bookerName: z.string().trim().min(1, "Your name is required").max(200),
  bookerEmail: z.string().email("Enter a valid email"),
  bookerPhone: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export type BookingResult = {
  error: string | null;
  confirmation?: { when: string; meetUrl: string | null; hostName?: string };
};

export async function bookMeetingAction(input: z.input<typeof bookingSchema>): Promise<BookingResult> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown";
  if (!rateLimit(`booking:${ip}`, 5, 10 * 60 * 1000)) {
    return { error: "Too many booking attempts — please try again in a few minutes." };
  }

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let phone: string | undefined;
  if (parsed.data.bookerPhone) {
    const e164 = toE164(parsed.data.bookerPhone);
    if (!e164) return { error: "Enter a valid phone number (e.g. +960 777 1234)" };
    phone = e164;
  }

  try {
    const meeting = await bookMeeting({
      slug: parsed.data.slug,
      startAtIso: parsed.data.startAtIso,
      bookerName: parsed.data.bookerName,
      bookerEmail: parsed.data.bookerEmail,
      bookerPhone: phone,
      notes: parsed.data.notes,
    });
    return {
      error: null,
      confirmation: { when: formatDateTime(meeting.startAt), meetUrl: meeting.googleMeetUrl },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
