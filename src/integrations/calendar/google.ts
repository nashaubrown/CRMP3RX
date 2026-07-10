import { db } from "@/lib/db";

import type {
  BusyInterval,
  CalendarEventInput,
  CalendarEventResult,
  CalendarProvider,
} from "./types";

// Google Calendar via plain REST (no googleapis dependency): token refresh,
// freeBusy, event create with Meet link, event delete. All methods degrade
// to no-ops/empty results when the user hasn't connected a calendar.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

async function getAccessToken(userId: string): Promise<{
  token: string;
  calendarId: string;
} | null> {
  const account = await db.googleCalendarAccount.findUnique({ where: { userId } });
  if (!account) return null;

  // Refresh when within 60s of expiry
  if (account.expiresAt.getTime() - Date.now() > 60_000) {
    return { token: account.accessToken, calendarId: account.calendarId };
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error(`[google-calendar] token refresh failed for user ${userId}: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  await db.googleCalendarAccount.update({
    where: { userId },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return { token: data.access_token, calendarId: account.calendarId };
}

export class GoogleCalendarProvider implements CalendarProvider {
  async getBusy(userId: string, from: Date, to: Date): Promise<BusyInterval[]> {
    const auth = await getAccessToken(userId);
    if (!auth) return [];

    const res = await fetch(`${CAL_BASE}/freeBusy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: auth.calendarId }],
      }),
    });
    if (!res.ok) {
      console.error(`[google-calendar] freeBusy failed: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    };
    const busy = data.calendars?.[auth.calendarId]?.busy ?? [];
    return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }

  async createEvent(
    userId: string,
    input: CalendarEventInput
  ): Promise<CalendarEventResult | null> {
    const auth = await getAccessToken(userId);
    if (!auth) return null;

    const params = new URLSearchParams({ sendUpdates: "all" });
    if (input.withMeet) params.set("conferenceDataVersion", "1");

    const res = await fetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events?${params}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: input.summary,
          description: input.description,
          start: { dateTime: input.startAt.toISOString() },
          end: { dateTime: input.endAt.toISOString() },
          attendees: input.attendees,
          ...(input.withMeet
            ? {
                conferenceData: {
                  createRequest: {
                    requestId: `perx-${Date.now()}`,
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                  },
                },
              }
            : {}),
        }),
      }
    );
    if (!res.ok) {
      console.error(`[google-calendar] event create failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as {
      id: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
    };
    const meetUrl =
      data.hangoutLink ??
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
      null;
    return { eventId: data.id, meetUrl };
  }

  async deleteEvent(userId: string, eventId: string): Promise<void> {
    const auth = await getAccessToken(userId);
    if (!auth) return;
    const res = await fetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: "DELETE", headers: { Authorization: `Bearer ${auth.token}` } }
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error(`[google-calendar] event delete failed: ${res.status}`);
    }
  }
}

export function getCalendarProvider(): CalendarProvider {
  return new GoogleCalendarProvider();
}
