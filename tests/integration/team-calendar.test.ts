import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import type { CalendarEventInput, CalendarProvider } from "@/integrations/calendar/types";
import {
  getTeamCalendarId,
  mirrorMeetingToTeamCalendar,
  removeMeetingFromTeamCalendar,
  setTeamCalendarId,
  TeamCalendarError,
  teamCalendarSubscribeUrl,
} from "@/services/team-calendar";

const suffix = `tcal-${Math.random().toString(36).slice(2, 8)}`;
const TEAM_CAL = `perx-team-${suffix}@group.calendar.google.com`;
let admin: SessionUser;
let rep: SessionUser;
let meetingId: string;

// Records what the provider was asked to write, so the test can assert where
// the event went and who was (not) invited.
type Written = { userId: string; input: CalendarEventInput };
function recordingProvider(written: Written[], deleted: string[][]): CalendarProvider {
  return {
    getBusy: async () => [],
    listEvents: async () => null,
    createEvent: async (userId, input) => {
      written.push({ userId, input });
      return { eventId: `evt-${written.length}`, meetUrl: null };
    },
    deleteEvent: async (userId, eventId, calendarId) => {
      deleted.push([userId, eventId, calendarId ?? "primary"]);
    },
  };
}

beforeAll(async () => {
  const [a, r] = await Promise.all([
    db.user.create({ data: { name: "TCal Admin", email: `a-${suffix}@t.mv`, role: "ADMIN" } }),
    db.user.create({ data: { name: "Sahaaf", email: `r-${suffix}@t.mv`, role: "SALES_REP" } }),
  ]);
  admin = { id: a.id, role: "ADMIN", name: a.name };
  rep = { id: r.id, role: "SALES_REP", name: r.name };

  const m = await db.meeting.create({
    data: {
      hostUserId: r.id,
      title: `Site visit ${suffix}`,
      bookerName: "Ali Rasheed",
      bookerEmail: "ali@example.mv",
      startAt: new Date("2026-09-10T04:00:00Z"),
      endAt: new Date("2026-09-10T05:00:00Z"),
      googleMeetUrl: "https://meet.google.com/abc-defg-hij",
    },
  });
  meetingId = m.id;
});

afterAll(async () => {
  await db.meeting.deleteMany({ where: { title: { contains: suffix } } });
  await db.calendarSetting.deleteMany({ where: { id: "singleton" } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("shared team calendar", () => {
  it("only admins can set it, and a pasted non-ID is rejected", async () => {
    await expect(setTeamCalendarId(rep, TEAM_CAL)).rejects.toThrow(TeamCalendarError);
    await expect(setTeamCalendarId(admin, "https://calendar.google.com/whatever")).rejects.toThrow(
      TeamCalendarError
    );
    await setTeamCalendarId(admin, TEAM_CAL);
    expect(await getTeamCalendarId()).toBe(TEAM_CAL);
  });

  it("mirrors a meeting onto the shared calendar, hosted-by-first and with no attendees", async () => {
    const written: Written[] = [];
    const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });

    const eventId = await mirrorMeetingToTeamCalendar(
      meeting,
      { id: rep.id, name: rep.name ?? null },
      recordingProvider(written, [])
    );

    expect(written).toHaveLength(1);
    expect(written[0].userId).toBe(rep.id); // written with the host's own token
    expect(written[0].input.calendarId).toBe(TEAM_CAL);
    expect(written[0].input.summary).toBe(`Sahaaf · Site visit ${suffix}`);
    // The merchant must not be invited a second time from a calendar they
    // have nothing to do with.
    expect(written[0].input.attendees).toEqual([]);
    expect(written[0].input.description).toContain("ali@example.mv");

    const saved = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    expect(saved.teamEventId).toBe(eventId);
  });

  it("removes the mirror from the shared calendar on cancellation", async () => {
    const deleted: string[][] = [];
    const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    await removeMeetingFromTeamCalendar(meeting, recordingProvider([], deleted));
    expect(deleted).toEqual([[rep.id, meeting.teamEventId, TEAM_CAL]]);
  });

  it("does nothing at all when no team calendar is configured", async () => {
    await setTeamCalendarId(admin, "");
    expect(await getTeamCalendarId()).toBeNull();

    const written: Written[] = [];
    const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    const res = await mirrorMeetingToTeamCalendar(
      meeting,
      { id: rep.id, name: rep.name ?? null },
      recordingProvider(written, [])
    );
    expect(res).toBeNull();
    expect(written).toHaveLength(0);
  });

  it("a provider failure never propagates — a booking is already made", async () => {
    await setTeamCalendarId(admin, TEAM_CAL);
    const exploding: CalendarProvider = {
      getBusy: async () => [],
      listEvents: async () => null,
      deleteEvent: async () => {},
      createEvent: async () => {
        throw new Error("calendar not shared with this user");
      },
    };
    const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    await expect(
      mirrorMeetingToTeamCalendar(meeting, { id: rep.id, name: rep.name ?? null }, exploding)
    ).resolves.toBeNull();
  });

  it("builds the one-click subscribe link", () => {
    expect(teamCalendarSubscribeUrl(TEAM_CAL)).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(TEAM_CAL)}`
    );
  });
});
