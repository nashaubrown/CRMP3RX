import { getCalendarProvider } from "@/integrations/calendar/google";
import { formatDateTime, parseMvLocal } from "@/lib/datetime";
import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/html";
import type { SessionUser } from "@/lib/authz";
import { canContribute, resolveMerchantId } from "@/services/activities";
import { audit } from "@/services/audit";
import { sendSystemEmail, sendSystemSms } from "@/services/messaging";

// A user schedules a meeting directly from a merchant/contact page. The
// current user is the host; the attendee is invited by email (+ optional SMS)
// and the event lands on the host's Google Calendar when connected. A linked
// MEETING activity keeps it on the record's timeline.
export type ScheduleMeetingInput = {
  entityType: "MERCHANT" | "CONTACT";
  entityId: string;
  title: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string; // E.164
  startAtLocal: string; // datetime-local, Maldives time
  durationMins: number;
  notes?: string;
};

export async function scheduleMeeting(ctx: SessionUser, input: ScheduleMeetingInput) {
  // Same gate as logging activity: edit rights on the underlying merchant.
  const allowed = await canContribute(ctx, input.entityType, input.entityId);
  if (!allowed) throw new Error("You don't have edit access to this record");

  const startAt = parseMvLocal(input.startAtLocal);
  if (Number.isNaN(startAt.getTime())) throw new Error("Invalid date/time");
  if (startAt.getTime() < Date.now()) throw new Error("Pick a time in the future");
  const endAt = new Date(startAt.getTime() + input.durationMins * 60 * 1000);

  const contactId =
    input.entityType === "CONTACT"
      ? input.entityId
      : (
          await db.contact.findFirst({
            where: {
              merchantId: input.entityId,
              email: { equals: input.attendeeEmail, mode: "insensitive" },
            },
            select: { id: true },
          })
        )?.id ?? null;

  // Clash check against the host's own confirmed meetings (free-form times,
  // so overlap rather than exact-slot comparison).
  const meeting = await db.$transaction(async (tx) => {
    const clash = await tx.meeting.findFirst({
      where: {
        hostUserId: ctx.id,
        status: "CONFIRMED",
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true, startAt: true },
    });
    if (clash) {
      throw new Error(`You already have a meeting at ${formatDateTime(clash.startAt)}`);
    }
    return tx.meeting.create({
      data: {
        hostUserId: ctx.id,
        contactId,
        title: input.title,
        notes: input.notes ?? null,
        bookerName: input.attendeeName,
        bookerEmail: input.attendeeEmail,
        bookerPhone: input.attendeePhone ?? null,
        startAt,
        endAt,
      },
    });
  });

  // Mirror onto the record's timeline.
  await db.activity.create({
    data: {
      type: "MEETING",
      subject: input.title,
      body: input.notes ?? null,
      dueAt: startAt,
      entityType: input.entityType,
      entityId: input.entityId,
      ownerId: ctx.id,
      meetingId: meeting.id,
    },
  });

  // Google event + Meet link (no-op when the host hasn't connected)
  const event = await getCalendarProvider().createEvent(ctx.id, {
    summary: input.title,
    description: input.notes
      ? `Scheduled via Perx CRM.\n\nNotes: ${input.notes}`
      : "Scheduled via Perx CRM.",
    startAt,
    endAt,
    attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }],
    withMeet: true,
  });
  if (event) {
    await db.meeting.update({
      where: { id: meeting.id },
      data: { googleEventId: event.eventId, googleMeetUrl: event.meetUrl },
    });
  }

  await audit({
    actorId: ctx.id,
    action: "meeting.schedule",
    entityType: input.entityType,
    entityId: input.entityId,
    merchantId: await resolveMerchantId(input.entityType, input.entityId),
    diff: {
      meetingId: meeting.id,
      title: input.title,
      attendeeEmail: input.attendeeEmail,
      startAt: startAt.toISOString(),
    },
  });

  // Invite the attendee (email + SMS when a phone was given)
  const when = formatDateTime(startAt);
  const meetLine = event?.meetUrl
    ? `<p>Join online: <a href="${escapeHtml(event.meetUrl)}">${escapeHtml(event.meetUrl)}</a></p>`
    : "";
  await sendSystemEmail({
    to: input.attendeeEmail,
    subject: `Meeting with ${ctx.name} (Perx) — ${when}`,
    bodyHtml: `<p>Hi ${escapeHtml(input.attendeeName)},</p><p>${escapeHtml(ctx.name ?? "Your contact")} from Perx has scheduled <strong>${escapeHtml(input.title)}</strong> with you for <strong>${when}</strong> (Maldives time).</p>${meetLine}<p>See you then!</p>`,
    sentById: ctx.id,
    entityType: contactId ? "CONTACT" : input.entityType,
    entityId: contactId ?? input.entityId,
  });
  if (input.attendeePhone) {
    await sendSystemSms({
      to: input.attendeePhone,
      body: `Hi ${input.attendeeName}, ${ctx.name} (Perx) scheduled "${input.title}" with you for ${when} (MV time). Reply STOP to opt out.`,
      sentById: ctx.id,
      entityType: contactId ? "CONTACT" : input.entityType,
      entityId: contactId ?? input.entityId,
    });
  }

  return { ...meeting, googleMeetUrl: event?.meetUrl ?? null };
}

export async function hasCalendarConnected(userId: string): Promise<boolean> {
  const account = await db.googleCalendarAccount.findFirst({
    where: { userId },
    select: { id: true },
  });
  return Boolean(account);
}

export async function listUpcomingMeetings(ctx: SessionUser) {
  return db.meeting.findMany({
    where: { hostUserId: ctx.id, status: "CONFIRMED", endAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  });
}

// The whole team's upcoming confirmed meetings — an agenda view (reps schedule
// meetings with merchants; nobody self-books).
export async function listTeamAgenda(limit = 50) {
  return db.meeting.findMany({
    where: { status: "CONFIRMED", endAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    take: limit,
    include: {
      host: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

const MEETING_INCLUDE = {
  host: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
} as const;

// Team-wide meetings for the agenda: upcoming (ascending) and recent past
// (descending), confirmed only.
export async function listTeamMeetings() {
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    db.meeting.findMany({
      where: { status: "CONFIRMED", endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 100,
      include: MEETING_INCLUDE,
    }),
    db.meeting.findMany({
      where: { status: "CONFIRMED", endAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: 50,
      include: MEETING_INCLUDE,
    }),
  ]);
  return { upcoming, past };
}

// Confirmed meetings whose start falls within the given Maldives-time month.
export async function listMeetingsInMonth(monthStart: Date, monthEnd: Date) {
  return db.meeting.findMany({
    where: { status: "CONFIRMED", startAt: { gte: monthStart, lt: monthEnd } },
    orderBy: { startAt: "asc" },
    include: MEETING_INCLUDE,
  });
}

const REMINDER_LEAD_MS = 60 * 60 * 1000; // remind ~1 hour before

// Sends a one-hour-before reminder to the attendee (email + SMS) and the host
// (email), for any confirmed meeting starting within the next hour that hasn't
// been reminded yet. Idempotent: each meeting is claimed by stamping
// reminderSentAt before sending, so overlapping cron runs never double-send.
// Meant to be called by the reminders cron.
export async function sendDueMeetingReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MS);

  const due = await db.meeting.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      startAt: { gt: now, lte: windowEnd },
    },
    include: { host: { select: { id: true, name: true, email: true } } },
  });

  let sent = 0;
  for (const m of due) {
    // Claim before sending so a concurrent run can't also send this one.
    const claim = await db.meeting.updateMany({
      where: { id: m.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claim.count === 0) continue;

    const when = formatDateTime(m.startAt);
    const hostName = m.host.name ?? "Perx";
    const meetLine = m.googleMeetUrl
      ? `<p>Join online: <a href="${escapeHtml(m.googleMeetUrl)}">${escapeHtml(m.googleMeetUrl)}</a></p>`
      : "";
    const entityType = m.contactId ? ("CONTACT" as const) : undefined;
    const entityId = m.contactId ?? undefined;

    // Attendee (merchant contact)
    await sendSystemEmail({
      to: m.bookerEmail,
      subject: `Reminder: ${m.title} in 1 hour (Perx)`,
      bodyHtml: `<p>Hi ${escapeHtml(m.bookerName)},</p><p>A reminder that <strong>${escapeHtml(
        m.title
      )}</strong> with ${escapeHtml(
        hostName
      )} starts at <strong>${when}</strong> (Maldives time) — about an hour from now.</p>${meetLine}<p>See you soon!</p>`,
      sentById: m.hostUserId,
      entityType,
      entityId,
    });
    if (m.bookerPhone) {
      await sendSystemSms({
        to: m.bookerPhone,
        body: `Reminder: "${m.title}" with ${hostName} (Perx) starts at ${when} (MV time), about an hour from now.${
          m.googleMeetUrl ? ` Join: ${m.googleMeetUrl}` : ""
        }`,
        sentById: m.hostUserId,
        entityType,
        entityId,
      });
    }

    // Host (rep)
    if (m.host.email) {
      await sendSystemEmail({
        to: m.host.email,
        subject: `Reminder: ${m.title} with ${m.bookerName} in 1 hour`,
        bodyHtml: `<p>Hi ${escapeHtml(
          m.host.name ?? ""
        )},</p><p>Reminder: <strong>${escapeHtml(m.title)}</strong> with ${escapeHtml(
          m.bookerName
        )} starts at <strong>${when}</strong> (Maldives time), about an hour from now.</p>${meetLine}`,
        sentById: m.hostUserId,
      });
    }

    sent++;
  }

  return { considered: due.length, sent };
}

export async function cancelMeeting(ctx: SessionUser, meetingId: string) {
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new Error("Meeting not found");
  if (meeting.hostUserId !== ctx.id && ctx.role !== "ADMIN") {
    throw new Error("Only the host or an admin can cancel");
  }

  await db.meeting.update({ where: { id: meetingId }, data: { status: "CANCELLED" } });
  // Remove the mirrored timeline entry, if this meeting was scheduled from a record page.
  await db.activity.deleteMany({ where: { meetingId } });
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
    bodyHtml: `<p>Hi ${escapeHtml(meeting.bookerName)},</p><p>Your meeting scheduled for <strong>${formatDateTime(meeting.startAt)}</strong> (Maldives time) has been cancelled. Feel free to book a new time.</p>`,
    sentById: meeting.hostUserId,
  });
}

