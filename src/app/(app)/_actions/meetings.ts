"use server";

import { revalidatePath } from "next/cache";

import { toE164 } from "@/lib/phone";
import { requireUserOrThrow } from "@/lib/rbac";
import { scheduleMeetingSchema } from "@/lib/validators/meeting";
import { scheduleMeeting } from "@/services/scheduling";

export type ScheduleMeetingState = {
  error: string | null;
  success?: boolean;
  meetUrl?: string | null;
};

export async function scheduleMeetingAction(
  _prev: ScheduleMeetingState,
  formData: FormData
): Promise<ScheduleMeetingState> {
  const ctx = await requireUserOrThrow();

  // formData.get() returns null for absent fields; the schema expects undefined.
  const parsed = scheduleMeetingSchema.safeParse({
    entityType: formData.get("entityType") ?? undefined,
    entityId: formData.get("entityId") ?? undefined,
    title: formData.get("title") ?? undefined,
    attendeeName: formData.get("attendeeName") ?? undefined,
    attendeeEmail: formData.get("attendeeEmail") ?? undefined,
    attendeePhone: formData.get("attendeePhone") ?? undefined,
    startAtLocal: formData.get("startAtLocal") ?? undefined,
    durationMins: formData.get("durationMins") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let phone: string | undefined;
  if (parsed.data.attendeePhone) {
    const e164 = toE164(parsed.data.attendeePhone);
    if (!e164) return { error: "Enter a valid phone number (e.g. +960 777 1234)" };
    phone = e164;
  }

  let meetUrl: string | null = null;
  try {
    const meeting = await scheduleMeeting(ctx, { ...parsed.data, attendeePhone: phone });
    meetUrl = meeting.googleMeetUrl;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }

  const revalidate = formData.get("revalidate");
  if (typeof revalidate === "string" && revalidate.startsWith("/")) revalidatePath(revalidate);
  return { error: null, success: true, meetUrl };
}
