import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { getCalendarProvider } from "@/integrations/calendar/google";
import type { CalendarProvider } from "@/integrations/calendar/types";

// The shared "Perx CRM Meetings" Google calendar: every meeting booked in the
// CRM is mirrored onto it, so a teammate who adds that one calendar in Google
// sees everyone's bookings — no per-person fan-out, no invitations, and the
// merchant never sees anyone beyond their own rep.
//
// Mirrors carry no attendees on purpose: the real invitation goes out from the
// host's own event, and duplicating attendees here would send the merchant a
// second invite from a calendar they have nothing to do with.

export class TeamCalendarError extends Error {}

export async function getTeamCalendarId(): Promise<string | null> {
  const row = await db.calendarSetting.findUnique({ where: { id: "singleton" } });
  return row?.teamCalendarId?.trim() || null;
}

export async function setTeamCalendarId(ctx: SessionUser, raw: string | null) {
  if (!isAdmin(ctx)) throw new TeamCalendarError("Only admins can set the team calendar.");
  const value = raw?.trim() || null;
  // Google calendar ids are addresses (…@group.calendar.google.com) or
  // "primary". Catching a pasted URL here saves a silent no-op later.
  if (value && !value.includes("@") && value !== "primary") {
    throw new TeamCalendarError(
      "That doesn't look like a calendar ID — copy the one ending in @group.calendar.google.com from Google Calendar settings."
    );
  }
  await db.calendarSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", teamCalendarId: value, updatedById: ctx.id },
    update: { teamCalendarId: value, updatedById: ctx.id },
  });
  return value;
}

// Writes the mirror. Best-effort by contract: the calendar not being shared
// with this host is a configuration problem, never a reason to fail a booking
// that has already been made and emailed.
export async function mirrorMeetingToTeamCalendar(
  meeting: {
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    bookerName: string;
    bookerEmail: string;
    notes?: string | null;
    googleMeetUrl?: string | null;
  },
  host: { id: string; name: string | null },
  provider: CalendarProvider = getCalendarProvider()
): Promise<string | null> {
  try {
    const calendarId = await getTeamCalendarId();
    if (!calendarId) return null;

    const lines = [
      `Host: ${host.name ?? "Perx"}`,
      `With: ${meeting.bookerName} <${meeting.bookerEmail}>`,
      meeting.notes ? `Notes: ${meeting.notes}` : null,
      meeting.googleMeetUrl ? `Meet: ${meeting.googleMeetUrl}` : null,
      "Mirrored from Perx CRM.",
    ].filter(Boolean);

    const event = await provider.createEvent(host.id, {
      // Host first: a shared calendar is read as a list, and whose meeting it
      // is matters more than what it's called.
      summary: `${host.name ?? "Perx"} · ${meeting.title}`,
      description: lines.join("\n"),
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      attendees: [],
      calendarId,
    });
    if (!event) return null;

    await db.meeting.update({
      where: { id: meeting.id },
      data: { teamEventId: event.eventId },
    });
    return event.eventId;
  } catch (e) {
    console.error("[team-calendar] mirror failed", e);
    return null;
  }
}

export async function removeMeetingFromTeamCalendar(
  meeting: { teamEventId: string | null; hostUserId: string },
  provider: CalendarProvider = getCalendarProvider()
): Promise<void> {
  if (!meeting.teamEventId) return;
  try {
    const calendarId = await getTeamCalendarId();
    if (!calendarId) return;
    await provider.deleteEvent(meeting.hostUserId, meeting.teamEventId, calendarId);
  } catch (e) {
    console.error("[team-calendar] mirror removal failed", e);
  }
}

// The link that adds the shared calendar to someone's own Google Calendar —
// what "subscribe" means in practice, and why nobody needs a CRM toggle.
export function teamCalendarSubscribeUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`;
}
