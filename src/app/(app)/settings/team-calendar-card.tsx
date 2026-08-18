"use client";

import * as React from "react";
import { CalendarPlusIcon, ExternalLinkIcon, Loader2Icon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { saveTeamCalendarAction } from "@/app/(app)/settings/team-calendar-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// One shared Google calendar carrying every CRM meeting. Admins set which
// calendar; anyone can add it to their own Google in one click — that's what
// "turning it on" means here, and it's a Google action, not a CRM toggle.
export function TeamCalendarCard({
  calendarId,
  subscribeUrl,
  isAdmin,
}: {
  calendarId: string | null;
  subscribeUrl: string | null;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await saveTeamCalendarAction(formData.get("teamCalendarId"));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.cleared ? "Team calendar turned off" : "Team calendar saved");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon className="size-4" /> Team meetings calendar
        </CardTitle>
        <CardDescription>
          Every meeting booked in the CRM — by anyone — is also written to one shared Google
          calendar. Add it to your own Google once and you see the whole team&apos;s bookings,
          without being invited to each other&apos;s meetings.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {calendarId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Sharing is on</p>
              <p className="text-muted-foreground truncate font-mono text-xs">{calendarId}</p>
            </div>
            {subscribeUrl ? (
              <Button asChild size="sm">
                <a href={subscribeUrl} target="_blank" rel="noreferrer">
                  <CalendarPlusIcon className="size-4" /> Add to my Google Calendar
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Not set up yet{isAdmin ? "." : " — ask an admin to add the calendar ID."}
          </p>
        )}

        {isAdmin ? (
          <form action={submit} className="flex flex-col gap-2">
            <Label htmlFor="team-cal">Google calendar ID</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="team-cal"
                name="teamCalendarId"
                defaultValue={calendarId ?? ""}
                placeholder="something@group.calendar.google.com"
                className="min-w-64 flex-1 font-mono text-xs"
              />
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
            <div className="text-muted-foreground flex flex-col gap-1 text-xs">
              <p className="font-medium">Setting it up, once:</p>
              <ol className="list-inside list-decimal space-y-0.5">
                <li>
                  In Google Calendar, create a calendar called e.g. &ldquo;Perx CRM
                  Meetings&rdquo;.
                </li>
                <li>
                  Share it with <strong>every person who books meetings</strong>, with
                  &ldquo;Make changes to events&rdquo; — the CRM writes as them, so without
                  this their meetings silently won&apos;t appear.
                </li>
                <li>
                  Copy its <strong>Calendar ID</strong>{" "}
                  from that calendar&apos;s settings and paste it above. Leave the field empty to
                  turn sharing off.
                </li>
              </ol>
              <p className="inline-flex items-center gap-1">
                <a
                  href="https://calendar.google.com/calendar/r/settings/createcalendar"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Create a calendar in Google <ExternalLinkIcon className="inline size-3" />
                </a>
              </p>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
