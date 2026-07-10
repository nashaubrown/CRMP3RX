import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { getCalendarProvider } from "@/integrations/calendar/google";
import type { BusyInterval } from "@/integrations/calendar/types";
import { APP_TIMEZONE, formatDateTime, parseMvLocal } from "@/lib/datetime";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { audit } from "@/services/audit";
import { sendSystemEmail, sendSystemSms } from "@/services/messaging";

export const BOOKING_WINDOW_DAYS = 14;
const MIN_NOTICE_MS = 60 * 60 * 1000; // 1h before a slot can be booked

export type Slot = { startAt: Date; endAt: Date };

type ScheduleWithRules = {
  slotDurationMins: number;
  bufferMins: number;
  timezone: string;
  rules: { dayOfWeek: number; startMinutes: number; endMinutes: number }[];
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date, bufferMs: number) {
  return aStart.getTime() < bEnd.getTime() + bufferMs && aEnd.getTime() > bStart.getTime() - bufferMs;
}

// Pure slot generator — unit-testable without a database.
export function generateSlots(
  schedule: ScheduleWithRules,
  busy: BusyInterval[],
  now: Date,
  days = BOOKING_WINDOW_DAYS
): Slot[] {
  const slots: Slot[] = [];
  const bufferMs = schedule.bufferMins * 60 * 1000;
  const durationMs = schedule.slotDurationMins * 60 * 1000;

  for (let i = 0; i < days; i++) {
    const day = addDays(now, i);
    const dayStr = formatInTimeZone(day, schedule.timezone, "yyyy-MM-dd");
    // ISO weekday 1(Mon)…7(Sun) → 0(Sun)…6(Sat)
    const dayOfWeek = Number(formatInTimeZone(day, schedule.timezone, "i")) % 7;

    for (const rule of schedule.rules.filter((r) => r.dayOfWeek === dayOfWeek)) {
      for (
        let minutes = rule.startMinutes;
        minutes + schedule.slotDurationMins <= rule.endMinutes;
        minutes += schedule.slotDurationMins
      ) {
        const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
        const mm = String(minutes % 60).padStart(2, "0");
        const startAt = parseMvLocal(`${dayStr}T${hh}:${mm}`);
        const endAt = new Date(startAt.getTime() + durationMs);

        if (startAt.getTime() < now.getTime() + MIN_NOTICE_MS) continue;
        if (busy.some((b) => overlaps(startAt, endAt, b.start, b.end, bufferMs))) continue;

        slots.push({ startAt, endAt });
      }
    }
  }

  return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export async function getBookingHost(slug: string) {
  return db.user.findUnique({
    where: { bookingSlug: slug },
    select: {
      id: true,
      name: true,
      availability: { include: { rules: true } },
      calendarAccount: { select: { id: true } },
    },
  });
}

// All available slots for a host over the booking window.
export async function getAvailableSlots(hostUserId: string): Promise<Slot[]> {
  const schedule = await db.availabilitySchedule.findUnique({
    where: { userId: hostUserId },
    include: { rules: true },
  });
  if (!schedule || schedule.rules.length === 0) return [];

  const now = new Date();
  const rangeEnd = addDays(now, BOOKING_WINDOW_DAYS + 1);

  const [meetings, googleBusy] = await Promise.all([
    db.meeting.findMany({
      where: { hostUserId, status: "CONFIRMED", endAt: { gte: now }, startAt: { lte: rangeEnd } },
      select: { startAt: true, endAt: true },
    }),
    getCalendarProvider().getBusy(hostUserId, now, rangeEnd),
  ]);

  const busy: BusyInterval[] = [
    ...meetings.map((m) => ({ start: m.startAt, end: m.endAt })),
    ...googleBusy,
  ];

  return generateSlots(schedule, busy, now);
}

export type BookingInput = {
  slug: string;
  startAtIso: string;
  bookerName: string;
  bookerEmail: string;
  bookerPhone?: string; // E.164
  notes?: string;
};

export async function bookMeeting(input: BookingInput) {
  const host = await getBookingHost(input.slug);
  if (!host || !host.availability) throw new Error("This booking page is not available");

  const startAt = new Date(input.startAtIso);
  if (Number.isNaN(startAt.getTime())) throw new Error("Invalid slot");

  // Re-validate against the live availability (prevents stale/forged slots)
  const slots = await getAvailableSlots(host.id);
  const slot = slots.find((s) => s.startAt.getTime() === startAt.getTime());
  if (!slot) throw new Error("That slot was just taken — please pick another");

  // Link to an existing contact by email when possible
  const contact = await db.contact.findFirst({
    where: { email: { equals: input.bookerEmail, mode: "insensitive" } },
    select: { id: true },
  });

  const title = `Perx: ${input.bookerName} × ${host.name}`;

  // Double-booking backstop: unique (hostUserId, startAt) among CONFIRMED
  // isn't expressible as a Prisma constraint with a status filter, so re-check
  // inside the transaction.
  const meeting = await db.$transaction(async (tx) => {
    const clash = await tx.meeting.findFirst({
      where: { hostUserId: host.id, status: "CONFIRMED", startAt: slot.startAt },
      select: { id: true },
    });
    if (clash) throw new Error("That slot was just taken — please pick another");
    return tx.meeting.create({
      data: {
        hostUserId: host.id,
        contactId: contact?.id ?? null,
        title,
        notes: input.notes ?? null,
        bookerName: input.bookerName,
        bookerEmail: input.bookerEmail,
        bookerPhone: input.bookerPhone ?? null,
        startAt: slot.startAt,
        endAt: slot.endAt,
      },
    });
  });

  // Google event + Meet link (no-op when the host hasn't connected)
  const event = await getCalendarProvider().createEvent(host.id, {
    summary: title,
    description: input.notes ? `Booked via Perx CRM.\n\nNotes: ${input.notes}` : "Booked via Perx CRM.",
    startAt: slot.startAt,
    endAt: slot.endAt,
    attendees: [{ email: input.bookerEmail, displayName: input.bookerName }],
    withMeet: true,
  });
  if (event) {
    await db.meeting.update({
      where: { id: meeting.id },
      data: { googleEventId: event.eventId, googleMeetUrl: event.meetUrl },
    });
  }

  await audit({
    actorId: null,
    action: "meeting.book",
    entityType: "MEETING",
    entityId: meeting.id,
    diff: { host: host.name, bookerEmail: input.bookerEmail, startAt: slot.startAt.toISOString() },
  });

  // Confirmations (email + SMS when a phone was given)
  const when = formatDateTime(slot.startAt);
  const meetLine = event?.meetUrl
    ? `<p>Join online: <a href="${event.meetUrl}">${event.meetUrl}</a></p>`
    : "";
  await sendSystemEmail({
    to: input.bookerEmail,
    subject: `Confirmed: meeting with ${host.name} (Perx) — ${when}`,
    bodyHtml: `<p>Hi ${input.bookerName},</p><p>Your meeting with ${host.name} from Perx is confirmed for <strong>${when}</strong> (Maldives time).</p>${meetLine}<p>See you then!</p>`,
    sentById: host.id,
    entityType: contact ? "CONTACT" : undefined,
    entityId: contact?.id,
  });
  if (input.bookerPhone) {
    await sendSystemSms({
      to: input.bookerPhone,
      body: `Hi ${input.bookerName}, your meeting with ${host.name} (Perx) is confirmed for ${when} (MV time). Reply STOP to opt out.`,
      sentById: host.id,
      entityType: contact ? "CONTACT" : undefined,
      entityId: contact?.id,
    });
  }

  return { ...meeting, googleMeetUrl: event?.meetUrl ?? null };
}

export async function listUpcomingMeetings(ctx: SessionUser) {
  return db.meeting.findMany({
    where: { hostUserId: ctx.id, status: "CONFIRMED", endAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export async function cancelMeeting(ctx: SessionUser, meetingId: string) {
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new Error("Meeting not found");
  if (meeting.hostUserId !== ctx.id && ctx.role !== "ADMIN") {
    throw new Error("Only the host or an admin can cancel");
  }

  await db.meeting.update({ where: { id: meetingId }, data: { status: "CANCELLED" } });
  if (meeting.googleEventId) {
    await getCalendarProvider().deleteEvent(meeting.hostUserId, meeting.googleEventId);
  }

  await audit({
    actorId: ctx.id,
    action: "meeting.cancel",
    entityType: "MEETING",
    entityId: meetingId,
    diff: { bookerEmail: meeting.bookerEmail, startAt: meeting.startAt.toISOString() },
  });

  await sendSystemEmail({
    to: meeting.bookerEmail,
    subject: `Cancelled: meeting on ${formatDateTime(meeting.startAt)} (Perx)`,
    bodyHtml: `<p>Hi ${meeting.bookerName},</p><p>Your meeting scheduled for <strong>${formatDateTime(meeting.startAt)}</strong> (Maldives time) has been cancelled. Feel free to book a new time.</p>`,
    sentById: meeting.hostUserId,
  });
}

// Availability editor (settings)
export type AvailabilityInput = {
  bookingSlug: string;
  slotDurationMins: number;
  bufferMins: number;
  rules: { dayOfWeek: number; startMinutes: number; endMinutes: number }[];
};

export async function saveAvailability(ctx: SessionUser, input: AvailabilityInput) {
  const slugTaken = await db.user.findFirst({
    where: { bookingSlug: input.bookingSlug, NOT: { id: ctx.id } },
    select: { id: true },
  });
  if (slugTaken) throw new Error("That booking link is already taken");

  await db.user.update({ where: { id: ctx.id }, data: { bookingSlug: input.bookingSlug } });

  const schedule = await db.availabilitySchedule.upsert({
    where: { userId: ctx.id },
    create: {
      userId: ctx.id,
      timezone: APP_TIMEZONE,
      slotDurationMins: input.slotDurationMins,
      bufferMins: input.bufferMins,
    },
    update: { slotDurationMins: input.slotDurationMins, bufferMins: input.bufferMins },
  });
  await db.availabilityRule.deleteMany({ where: { scheduleId: schedule.id } });
  if (input.rules.length > 0) {
    await db.availabilityRule.createMany({
      data: input.rules.map((r) => ({ ...r, scheduleId: schedule.id })),
    });
  }

  await audit({
    actorId: ctx.id,
    action: "availability.update",
    entityType: "USER",
    entityId: ctx.id,
    diff: { slug: input.bookingSlug, rules: input.rules.length },
  });
}
