import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDaysIcon, CalendarRangeIcon, ListIcon } from "lucide-react";

import { MeetingList, type MeetingItem } from "@/app/(app)/settings/meeting-list";
import { MeetingsCalendar } from "@/components/meetings/meetings-calendar";
import { EmptyState } from "@/components/list/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, parseMvLocal } from "@/lib/datetime";
import { isAdmin, requireUser } from "@/lib/rbac";
import { listMeetingsInMonth, listTeamMeetings } from "@/services/scheduling";
import { listImportedEvents } from "@/services/calendar-sync";

export const metadata: Metadata = { title: "Meetings" };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function ym(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "agenda";

  const toItem = (m: {
    id: string;
    title: string;
    bookerName: string;
    bookerEmail: string;
    startAt: Date;
    googleMeetUrl: string | null;
    hostUserId: string;
    host: { name: string };
  }): MeetingItem => ({
    id: m.id,
    title: m.title,
    bookerName: m.bookerName,
    bookerEmail: m.bookerEmail,
    when: formatDateTime(m.startAt),
    meetUrl: m.googleMeetUrl,
    host: m.host.name,
    canCancel: admin || m.hostUserId === user.id,
  });

  // Agenda data.
  const agenda = view === "agenda" ? await listTeamMeetings() : null;

  // Events mirrored in from connected Google Calendars. Shown next to the CRM's
  // own meetings so the page reflects what the team actually has on.
  const now = new Date();
  const importedUpcoming =
    view === "agenda"
      ? await listImportedEvents(now, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
      : [];

  // Calendar data.
  let calendar: {
    year: number;
    month: number;
    prevHref: string;
    nextHref: string;
    meetings: Awaited<ReturnType<typeof listMeetingsInMonth>>;
    imported: Awaited<ReturnType<typeof listImportedEvents>>;
  } | null = null;
  if (view === "calendar") {
    const nowMonth = formatDateTime(new Date(), "yyyy-MM");
    const monthKey = sp.month && MONTH_RE.test(sp.month) ? sp.month : nowMonth;
    const [y, mo] = monthKey.split("-").map(Number);
    const monthStart = parseMvLocal(`${monthKey}-01T00:00`);
    const nextY = mo === 12 ? y + 1 : y;
    const nextMo = mo === 12 ? 1 : mo + 1;
    const prevY = mo === 1 ? y - 1 : y;
    const prevMo = mo === 1 ? 12 : mo - 1;
    const monthEnd = parseMvLocal(`${ym(nextY, nextMo)}-01T00:00`);
    calendar = {
      year: y,
      month: mo,
      prevHref: `/meetings?view=calendar&month=${ym(prevY, prevMo)}`,
      nextHref: `/meetings?view=calendar&month=${ym(nextY, nextMo)}`,
      meetings: await listMeetingsInMonth(monthStart, monthEnd),
      imported: await listImportedEvents(monthStart, monthEnd),
    };
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-muted-foreground text-sm">
            The team&apos;s meetings with merchants — scheduled from a merchant or contact page
          </p>
        </div>
        <div className="bg-muted inline-flex rounded-md p-0.5 text-sm">
          <Button asChild variant={view === "agenda" ? "secondary" : "ghost"} size="sm" className="h-7">
            <Link href="/meetings?view=agenda">
              <ListIcon /> Agenda
            </Link>
          </Button>
          <Button asChild variant={view === "calendar" ? "secondary" : "ghost"} size="sm" className="h-7">
            <Link href="/meetings?view=calendar">
              <CalendarRangeIcon /> Calendar
            </Link>
          </Button>
        </div>
      </div>

      {view === "calendar" && calendar ? (
        <MeetingsCalendar
          year={calendar.year}
          month={calendar.month}
          prevHref={calendar.prevHref}
          nextHref={calendar.nextHref}
          meetings={calendar.meetings.map((m) => ({
            id: m.id,
            startAt: m.startAt,
            bookerName: m.bookerName,
            hostName: m.host.name,
            meetUrl: m.googleMeetUrl,
          }))}
          imported={calendar.imported.map((e) => ({
            id: e.id,
            startAt: e.startAt,
            title: e.title,
            ownerName: e.user.name,
            isPrivate: e.isPrivate,
            allDay: e.allDay,
          }))}
        />
      ) : agenda &&
        (agenda.upcoming.length > 0 || agenda.past.length > 0 || importedUpcoming.length > 0) ? (
        <div className="flex flex-col gap-4">
          {agenda.upcoming.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upcoming ({agenda.upcoming.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <MeetingList meetings={agenda.upcoming.map(toItem)} />
              </CardContent>
            </Card>
          ) : null}

          {importedUpcoming.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  From Google Calendar ({importedUpcoming.length})
                </CardTitle>
                <CardDescription>
                  Booked outside the CRM, mirrored in from connected calendars. Events marked
                  private in Google show as Busy.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {importedUpcoming.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {e.isPrivate ? "Busy" : e.title}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {e.user.name}
                        {e.location && !e.isPrivate ? ` · ${e.location}` : ""}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {e.allDay ? formatDateTime(e.startAt, "d MMM") : formatDateTime(e.startAt)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {agenda.past.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Past ({agenda.past.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <MeetingList meetings={agenda.past.map((m) => ({ ...toItem(m), canCancel: false }))} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No meetings yet"
          description="Schedule a meeting from a merchant or contact page — it shows up here and syncs to Google Calendar. Connect your calendar in Settings and anything you book directly in Google appears here too."
        />
      )}
    </div>
  );
}
