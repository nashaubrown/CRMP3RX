import { db } from "@/lib/db";
import { getCalendarProvider } from "@/integrations/calendar/google";
import type { CalendarProvider } from "@/integrations/calendar/types";

// Pulls each connected Google Calendar into CalendarEvent rows so the CRM's
// Meetings views show what people actually have on, not only what was booked
// through the CRM.
//
// Mirrors, not sources of truth: rows are refreshed from Google every run and
// removed when the upstream event is deleted. Nothing here ever writes back —
// the CRM -> Google direction stays exactly as it was.

// How far back a first (full) sync reaches. Enough to explain "why is my
// calendar empty" without importing years of history.
const INITIAL_WINDOW_DAYS = 30;

export type CalendarSyncResult = {
  userId: string;
  imported: number;
  removed: number;
  reset: boolean;
  error?: string;
};

export async function syncUserCalendar(
  userId: string,
  provider: CalendarProvider = getCalendarProvider()
): Promise<CalendarSyncResult> {
  const base: CalendarSyncResult = { userId, imported: 0, removed: 0, reset: false };

  const account = await db.googleCalendarAccount.findUnique({ where: { userId } });
  if (!account) return { ...base, error: "not connected" };

  const since = new Date(Date.now() - INITIAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let page;
  try {
    page = await provider.listEvents(userId, { syncToken: account.syncToken, since });
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "list failed" };
  }
  if (!page) return { ...base, error: "list failed" };

  // A reset means Google handed us a fresh full pull: anything we hold that
  // isn't in this page no longer exists (or fell out of the window), so clear
  // the slate first rather than leaving orphans behind forever.
  if (page.reset) {
    await db.calendarEvent.deleteMany({ where: { userId } });
  }

  // Events the CRM itself created live as Meetings already; matching them by
  // Google's event id lets the UI show each meeting once.
  const externalIds = page.events.map((e) => e.externalId);
  const ownMeetings = externalIds.length
    ? await db.meeting.findMany({
        where: { hostUserId: userId, googleEventId: { in: externalIds } },
        select: { id: true, googleEventId: true },
      })
    : [];
  const meetingByEventId = new Map(
    ownMeetings.filter((m) => m.googleEventId).map((m) => [m.googleEventId as string, m.id])
  );

  let imported = 0;
  let removed = 0;

  for (const event of page.events) {
    if (event.cancelled) {
      const res = await db.calendarEvent.deleteMany({
        where: { userId, googleEventId: event.externalId },
      });
      removed += res.count;
      continue;
    }

    const data = {
      title: event.title,
      description: event.description ?? null,
      location: event.location ?? null,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      isPrivate: event.isPrivate,
      attendees: event.attendees.length ? event.attendees : undefined,
      htmlLink: event.htmlLink ?? null,
      meetUrl: event.meetUrl ?? null,
      organizerEmail: event.organizerEmail ?? null,
      meetingId: meetingByEventId.get(event.externalId) ?? null,
      syncedAt: new Date(),
    };

    await db.calendarEvent.upsert({
      where: { userId_googleEventId: { userId, googleEventId: event.externalId } },
      create: { userId, googleEventId: event.externalId, ...data },
      update: data,
    });
    imported += 1;
  }

  await db.googleCalendarAccount.update({
    where: { userId },
    // Only advance the cursor when Google gave us one; keeping the old token
    // on a partial run means the next run re-reads rather than skips.
    data: {
      ...(page.syncToken ? { syncToken: page.syncToken } : {}),
      lastSyncedAt: new Date(),
    },
  });

  return { userId, imported, removed, reset: page.reset };
}

// The cron entry point: every connected calendar, one after another. One
// person's failure never stops the rest.
export async function syncAllCalendars(
  provider: CalendarProvider = getCalendarProvider()
): Promise<{ synced: number; results: CalendarSyncResult[] }> {
  const accounts = await db.googleCalendarAccount.findMany({
    where: { user: { disabledAt: null } },
    select: { userId: true },
  });

  const results: CalendarSyncResult[] = [];
  for (const { userId } of accounts) {
    try {
      results.push(await syncUserCalendar(userId, provider));
    } catch (e) {
      results.push({
        userId,
        imported: 0,
        removed: 0,
        reset: false,
        error: e instanceof Error ? e.message : "sync failed",
      });
    }
  }
  return { synced: results.filter((r) => !r.error).length, results };
}

// Imported events in a window, for the Meetings views. Excludes anything
// already shown as a CRM meeting (meetingId set) so nothing appears twice.
export async function listImportedEvents(from: Date, to: Date) {
  return db.calendarEvent.findMany({
    where: {
      meetingId: null,
      startAt: { lt: to },
      endAt: { gt: from },
    },
    orderBy: { startAt: "asc" },
    include: { user: { select: { id: true, name: true } } },
  });
}

export async function getCalendarSyncState(userId: string) {
  const account = await db.googleCalendarAccount.findUnique({
    where: { userId },
    select: { lastSyncedAt: true },
  });
  if (!account) return null;
  const count = await db.calendarEvent.count({ where: { userId } });
  return { lastSyncedAt: account.lastSyncedAt, eventCount: count };
}
