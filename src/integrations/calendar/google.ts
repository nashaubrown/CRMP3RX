import { db } from "@/lib/db";

import type {
  BusyInterval,
  CalendarEventInput,
  CalendarEventResult,
  CalendarProvider,
  FetchedEvent,
  FetchedEventPage,
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

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  visibility?: string;
  htmlLink?: string;
  hangoutLink?: string;
  organizer?: { email?: string };
  attendees?: { email?: string; displayName?: string }[];
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

// Google -> our shape. Returns null for anything unusable (no id, or no times
// at all), so one malformed event can't abort a whole sync.
function mapEvent(e: GoogleEvent): FetchedEvent | null {
  if (!e.id) return null;
  const cancelled = e.status === "cancelled";

  // A cancelled event in an incremental page is often a tombstone: id and
  // status only. It still needs to flow through so the row gets removed.
  const startRaw = e.start?.dateTime ?? e.start?.date;
  const endRaw = e.end?.dateTime ?? e.end?.date;
  if (!cancelled && (!startRaw || !endRaw)) return null;

  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  const startAt = startRaw ? new Date(startRaw) : new Date(0);
  const endAt = endRaw ? new Date(endRaw) : new Date(0);
  if (!cancelled && (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()))) return null;

  return {
    externalId: e.id,
    title: e.summary?.trim() || "(no title)",
    description: e.description ?? null,
    location: e.location ?? null,
    startAt,
    endAt,
    allDay,
    isPrivate: e.visibility === "private" || e.visibility === "confidential",
    attendees: (e.attendees ?? [])
      .filter((a): a is { email: string; displayName?: string } => Boolean(a.email))
      .map((a) => ({ email: a.email, displayName: a.displayName })),
    htmlLink: e.htmlLink ?? null,
    meetUrl: e.hangoutLink ?? null,
    organizerEmail: e.organizer?.email ?? null,
    cancelled,
  };
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
    const target = input.calendarId ?? auth.calendarId;

    const res = await fetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(target)}/events?${params}`,
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

  // Incremental sync. Google's contract: a full pull (with timeMin) ends with
  // a nextSyncToken; later pulls pass that token INSTEAD of any other filter
  // and get only what changed, including deletions as status:"cancelled".
  // An expired token answers 410, which means "forget what you knew, start
  // over" — reported back as reset:true.
  async listEvents(
    userId: string,
    opts: { syncToken: string | null; since: Date }
  ): Promise<FetchedEventPage | null> {
    const auth = await getAccessToken(userId);
    if (!auth) return null;

    const collected: FetchedEvent[] = [];
    let pageToken: string | undefined;
    let syncToken = opts.syncToken;
    let reset = false;
    let nextSyncToken: string | null = null;

    // Bounded: a busy calendar over the window is a few pages, and the loop
    // can only restart once (a reset clears the token, so the retry is a full
    // pull that cannot 410 again).
    for (let guard = 0; guard < 25; guard++) {
      const params = new URLSearchParams({
        singleEvents: "true", // expand recurring series into dated instances
        maxResults: "250",
        showDeleted: syncToken ? "true" : "false",
      });
      // A syncToken cannot be combined with time filters — it IS the filter.
      if (syncToken) params.set("syncToken", syncToken);
      else params.set("timeMin", opts.since.toISOString());
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `${CAL_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );

      if (res.status === 410 && syncToken) {
        // Cursor expired. Drop it and restart as a full pull.
        syncToken = null;
        pageToken = undefined;
        collected.length = 0;
        reset = true;
        continue;
      }
      if (!res.ok) {
        console.error(`[google-calendar] events.list failed: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as {
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };
      for (const item of data.items ?? []) {
        const mapped = mapEvent(item);
        if (mapped) collected.push(mapped);
      }
      if (data.nextPageToken) {
        pageToken = data.nextPageToken;
        continue;
      }
      nextSyncToken = data.nextSyncToken ?? null;
      break;
    }

    return { events: collected, syncToken: nextSyncToken, reset };
  }

  async deleteEvent(userId: string, eventId: string, calendarId?: string): Promise<void> {
    const auth = await getAccessToken(userId);
    if (!auth) return;
    const res = await fetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId ?? auth.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
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
