import { apiError, apiJson, isResponse, readJson, requireApiUser } from "@/lib/api";
import { toE164 } from "@/lib/phone";
import { scheduleMeetingSchema } from "@/lib/validators/meeting";
import { scheduleMeeting } from "@/services/scheduling";

// Schedule a meeting (hosted by the key's owner) under a merchant or contact.
// Mirrors onto the record's timeline and syncs to Google Calendar when the
// host has connected their calendar.
export async function POST(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const body = await readJson(req);
  if (!body) return apiError(400, "Expected a JSON body");

  const parsed = scheduleMeetingSchema.safeParse(body);
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");

  let phone: string | undefined;
  if (parsed.data.attendeePhone) {
    const e164 = toE164(parsed.data.attendeePhone);
    if (!e164) return apiError(400, "Enter a valid phone number (e.g. +960 777 1234)");
    phone = e164;
  }

  try {
    const meeting = await scheduleMeeting(user, { ...parsed.data, attendeePhone: phone });
    return apiJson(
      {
        id: meeting.id,
        title: meeting.title,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
        meetUrl: meeting.googleMeetUrl,
      },
      201
    );
  } catch (e) {
    return apiError(400, e instanceof Error ? e.message : "Something went wrong");
  }
}
