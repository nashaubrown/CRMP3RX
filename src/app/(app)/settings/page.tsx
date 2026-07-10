import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheckIcon, CalendarIcon, LinkIcon } from "lucide-react";

import { disconnectCalendarAction } from "@/app/(app)/settings/actions";
import { AvailabilityForm } from "@/app/(app)/settings/availability-form";
import { MeetingList } from "@/app/(app)/settings/meeting-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { listUpcomingMeetings } from "@/services/scheduling";

export const metadata: Metadata = { title: "Settings" };

const CALENDAR_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected!",
  error: "Google Calendar connection failed — please try again.",
  "no-refresh-token":
    "Google didn't return offline access. Remove the app at myaccount.google.com/permissions and reconnect.",
  "not-configured": "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env to enable calendar connect.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const user = await requireUser();
  const { calendar: calendarMsg } = await searchParams;

  const [profile, meetings] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        bookingSlug: true,
        calendarAccount: { select: { createdAt: true } },
        availability: { include: { rules: true } },
      },
    }),
    listUpcomingMeetings(user),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Calendar connection, availability and your public booking page
        </p>
      </div>

      {calendarMsg && CALENDAR_MESSAGES[calendarMsg] ? (
        <Alert variant={calendarMsg === "connected" ? "default" : "destructive"}>
          <AlertDescription>{CALENDAR_MESSAGES[calendarMsg]}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="size-4" /> Google Calendar
          </CardTitle>
          <CardDescription>
            When connected, your busy times are excluded from the booking page and bookings
            create calendar events with Google Meet links.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          {profile?.calendarAccount ? (
            <>
              <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CalendarCheckIcon className="size-3" /> Connected since{" "}
                {formatDateTime(profile.calendarAccount.createdAt, "d MMM yyyy")}
              </Badge>
              <form action={disconnectCalendarAction}>
                <Button variant="outline" size="sm" type="submit">
                  Disconnect
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">Not connected</p>
              <Button size="sm" asChild>
                <a href="/api/google/connect">Connect Google Calendar</a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LinkIcon className="size-4" /> Availability & booking page
          </CardTitle>
          <CardDescription>
            {profile?.bookingSlug ? (
              <>
                Merchants can book you at{" "}
                <Link
                  href={`/book/${profile.bookingSlug}`}
                  className="underline"
                  target="_blank"
                >
                  {appUrl}/book/{profile.bookingSlug}
                </Link>
              </>
            ) : (
              "Set a booking link and weekly hours to accept bookings."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityForm
            initial={{
              bookingSlug: profile?.bookingSlug ?? "",
              slotDurationMins: profile?.availability?.slotDurationMins ?? 30,
              bufferMins: profile?.availability?.bufferMins ?? 10,
              rules:
                profile?.availability?.rules.map((r) => ({
                  dayOfWeek: r.dayOfWeek,
                  startMinutes: r.startMinutes,
                  endMinutes: r.endMinutes,
                })) ?? [],
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming meetings</CardTitle>
          <CardDescription>Bookings made through your public page.</CardDescription>
        </CardHeader>
        <CardContent>
          <MeetingList
            meetings={meetings.map((m) => ({
              id: m.id,
              title: m.title,
              bookerName: m.bookerName,
              bookerEmail: m.bookerEmail,
              when: formatDateTime(m.startAt),
              meetUrl: m.googleMeetUrl,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
