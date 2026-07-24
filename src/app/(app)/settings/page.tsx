import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheckIcon, CalendarIcon, LinkIcon } from "lucide-react";

import { disconnectCalendarAction } from "@/app/(app)/settings/actions";
import { AiProviderCard } from "@/app/(app)/settings/ai-provider-card";
import { ApiKeysCard } from "@/app/(app)/settings/api-keys-card";
import { OptionSetsCard } from "@/app/(app)/settings/option-sets-card";
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
import { AI_PROVIDER_OPTIONS, getAiSettings } from "@/services/ai-settings";
import { listApiKeys } from "@/services/api-keys";
import { isAdmin } from "@/lib/authz";
import { listManagedOptions, OPTION_SETS } from "@/services/option-sets";
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

  const admin = isAdmin(user);
  const [profile, meetings, apiKeys, aiSettings, optionSets] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        bookingSlug: true,
        calendarAccount: { select: { createdAt: true } },
        availability: { include: { rules: true } },
      },
    }),
    listUpcomingMeetings(user),
    listApiKeys(user),
    getAiSettings(user),
    admin
      ? Promise.all(
          OPTION_SETS.map(async (s) => ({
            key: s.key,
            label: s.label,
            description: s.description,
            priced: s.key === "SUBSCRIPTION_PLAN",
            options: (await listManagedOptions(user, s.key)).map((o) => ({
              id: o.id,
              label: o.label,
              archived: o.archived,
              priceMvr: o.priceMvr,
              perLocation: o.perLocation,
            })),
          }))
        )
      : Promise.resolve([]),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Calendar connection, availability, your public booking page, and API access
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
          <CardDescription>Meetings you host — booked via your public page or scheduled from a merchant/contact.</CardDescription>
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

      {admin ? <OptionSetsCard sets={optionSets} /> : null}

      {aiSettings.isAdmin ? (
        <AiProviderCard
          options={AI_PROVIDER_OPTIONS.map((o) => ({
            value: o.value,
            name: o.name,
            defaultModel: o.defaultModel,
            keyOptional: o.keyOptional,
            custom: o.custom,
            models: o.models,
          }))}
          active={aiSettings.activeProviderLabel}
          source={aiSettings.activeSource}
          configured={aiSettings.configured}
          saved={aiSettings.saved}
        />
      ) : null}

      <ApiKeysCard
        appUrl={appUrl}
        keys={apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          createdAt: formatDateTime(k.createdAt, "d MMM yyyy"),
          lastUsedAt: k.lastUsedAt ? formatDateTime(k.lastUsedAt) : null,
        }))}
      />
    </div>
  );
}
