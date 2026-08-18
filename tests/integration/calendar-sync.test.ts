import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type {
  CalendarProvider,
  FetchedEvent,
  FetchedEventPage,
} from "@/integrations/calendar/types";
import { listImportedEvents, syncUserCalendar } from "@/services/calendar-sync";

const suffix = `cal-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;

// A provider that replays pages we hand it, so the whole upsert/remove/reset
// path is exercised without touching Google.
function stubProvider(pages: FetchedEventPage[]): CalendarProvider {
  let i = 0;
  return {
    getBusy: async () => [],
    createEvent: async () => null,
    deleteEvent: async () => {},
    listEvents: async () => pages[Math.min(i++, pages.length - 1)] ?? null,
  };
}

const event = (over: Partial<FetchedEvent> & { externalId: string }): FetchedEvent => ({
  title: "Untitled",
  description: null,
  location: null,
  startAt: new Date("2026-09-01T09:00:00Z"),
  endAt: new Date("2026-09-01T10:00:00Z"),
  allDay: false,
  isPrivate: false,
  attendees: [],
  htmlLink: null,
  meetUrl: null,
  organizerEmail: null,
  cancelled: false,
  ...over,
});

beforeAll(async () => {
  const u = await db.user.create({
    data: { name: `Cal ${suffix}`, email: `cal-${suffix}@t.mv`, role: "SALES_REP" },
  });
  userId = u.id;
  await db.googleCalendarAccount.create({
    data: {
      userId,
      accessToken: "tok",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600_000),
      scope: "calendar.events",
    },
  });
});

afterAll(async () => {
  await db.calendarEvent.deleteMany({ where: { userId } });
  await db.meeting.deleteMany({ where: { hostUserId: userId } });
  await db.googleCalendarAccount.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("google calendar import", () => {
  it("imports events and stores the sync cursor", async () => {
    const res = await syncUserCalendar(
      userId,
      stubProvider([
        {
          events: [
            event({ externalId: "e1", title: "Merchant visit — Seagull" }),
            event({ externalId: "e2", title: "Dentist", isPrivate: true }),
          ],
          syncToken: "tok-1",
          reset: false,
        },
      ])
    );
    expect(res.imported).toBe(2);

    const rows = await db.calendarEvent.findMany({ where: { userId }, orderBy: { title: "asc" } });
    expect(rows.map((r) => r.title)).toEqual(["Dentist", "Merchant visit — Seagull"]);
    expect(rows.find((r) => r.googleEventId === "e2")?.isPrivate).toBe(true);

    const account = await db.googleCalendarAccount.findUnique({ where: { userId } });
    expect(account?.syncToken).toBe("tok-1");
    expect(account?.lastSyncedAt).not.toBeNull();
  });

  it("updates a changed event in place rather than duplicating it", async () => {
    await syncUserCalendar(
      userId,
      stubProvider([
        {
          events: [event({ externalId: "e1", title: "Merchant visit — moved to Tuesday" })],
          syncToken: "tok-2",
          reset: false,
        },
      ])
    );
    const rows = await db.calendarEvent.findMany({ where: { userId, googleEventId: "e1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Merchant visit — moved to Tuesday");
  });

  it("removes an event cancelled upstream", async () => {
    const res = await syncUserCalendar(
      userId,
      stubProvider([
        { events: [event({ externalId: "e2", cancelled: true })], syncToken: "tok-3", reset: false },
      ])
    );
    expect(res.removed).toBe(1);
    expect(await db.calendarEvent.count({ where: { userId, googleEventId: "e2" } })).toBe(0);
  });

  it("a reset clears stale rows before reloading the fresh page", async () => {
    const res = await syncUserCalendar(
      userId,
      stubProvider([
        { events: [event({ externalId: "fresh" })], syncToken: "tok-4", reset: true },
      ])
    );
    expect(res.reset).toBe(true);
    const rows = await db.calendarEvent.findMany({ where: { userId } });
    // e1 predates the reset and wasn't in the fresh page, so it's gone.
    expect(rows.map((r) => r.googleEventId)).toEqual(["fresh"]);
  });

  it("links a CRM-created meeting's own event so it isn't listed twice", async () => {
    const meeting = await db.meeting.create({
      data: {
        hostUserId: userId,
        title: `CRM booked ${suffix}`,
        bookerName: "Ali",
        bookerEmail: "ali@example.mv",
        startAt: new Date("2026-09-02T09:00:00Z"),
        endAt: new Date("2026-09-02T10:00:00Z"),
        googleEventId: "crm-1",
      },
    });

    await syncUserCalendar(
      userId,
      stubProvider([
        {
          events: [
            event({ externalId: "crm-1", title: `CRM booked ${suffix}` }),
            event({ externalId: "outside-1", title: "Booked straight in Google" }),
          ],
          syncToken: "tok-5",
          reset: true,
        },
      ])
    );

    const linked = await db.calendarEvent.findFirst({
      where: { userId, googleEventId: "crm-1" },
    });
    expect(linked?.meetingId).toBe(meeting.id);

    // The Meetings view asks for imported-only events: the CRM meeting's twin
    // is excluded, the externally-booked one is included.
    const shown = await listImportedEvents(
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-03T00:00:00Z")
    );
    const mine = shown.filter((e) => e.userId === userId);
    expect(mine.map((e) => e.googleEventId)).toEqual(["outside-1"]);
  });

  it("reports cleanly for a user with no calendar connected", async () => {
    const other = await db.user.create({
      data: { name: `NoCal ${suffix}`, email: `nocal-${suffix}@t.mv`, role: "SALES_REP" },
    });
    const res = await syncUserCalendar(other.id, stubProvider([]));
    expect(res.error).toBe("not connected");
    expect(res.imported).toBe(0);
    await db.user.delete({ where: { id: other.id } });
  });
});
