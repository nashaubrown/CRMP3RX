import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime, parseMvLocal } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export type CalendarMeeting = {
  id: string;
  startAt: Date;
  bookerName: string;
  hostName: string;
  meetUrl: string | null;
};

// An event mirrored in from someone's Google Calendar. Rendered in a quieter
// colour than CRM meetings so the two are never confused at a glance.
export type CalendarImported = {
  id: string;
  startAt: Date;
  title: string;
  ownerName: string;
  isPrivate: boolean;
  allDay: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Month grid of meetings, laid out in Maldives time. Server component — nav is
// plain links that change the ?month param.
export function MeetingsCalendar({
  year,
  month, // 1-based
  meetings,
  imported = [],
  prevHref,
  nextHref,
}: {
  year: number;
  month: number;
  meetings: CalendarMeeting[];
  imported?: CalendarImported[];
  prevHref: string;
  nextHref: string;
}) {
  const monthStart = parseMvLocal(`${year}-${String(month).padStart(2, "0")}-01T00:00`);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // ISO weekday (Mon=1…Sun=7) of the 1st → Sun=0…Sat=6.
  const firstWeekday = Number(formatDateTime(monthStart, "i")) % 7;

  const byDay = new Map<number, CalendarMeeting[]>();
  for (const m of meetings) {
    const d = Number(formatDateTime(m.startAt, "d"));
    const list = byDay.get(d);
    if (list) list.push(m);
    else byDay.set(d, [m]);
  }

  const importedByDay = new Map<number, CalendarImported[]>();
  for (const e of imported) {
    const d = Number(formatDateTime(e.startAt, "d"));
    const list = importedByDay.get(d);
    if (list) list.push(e);
    else importedByDay.set(d, [e]);
  }

  const nowKey = formatDateTime(new Date(), "yyyy-MM");
  const monthKey = formatDateTime(monthStart, "yyyy-MM");
  const todayDay = nowKey === monthKey ? Number(formatDateTime(new Date(), "d")) : null;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{formatDateTime(monthStart, "MMMM yyyy")}</h2>
        <div className="flex gap-1">
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={prevHref} aria-label="Previous month">
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={nextHref} aria-label="Next month">
              <ChevronRightIcon />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted/50 text-muted-foreground px-2 py-1.5 text-center text-xs font-medium">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const dayMeetings = day ? (byDay.get(day) ?? []) : [];
          const dayImported = day ? (importedByDay.get(day) ?? []) : [];
          return (
            <div
              key={i}
              className={cn(
                "bg-background min-h-24 p-1.5 align-top",
                day === null && "bg-muted/20"
              )}
            >
              {day !== null ? (
                <>
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs",
                      day === todayDay ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-1 flex flex-col gap-1">
                    {dayMeetings.slice(0, 3).map((m) => (
                      <div
                        key={m.id}
                        className="truncate rounded bg-emerald-500/15 px-1 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
                        title={`${formatDateTime(m.startAt, "HH:mm")} ${m.bookerName} · ${m.hostName}`}
                      >
                        {formatDateTime(m.startAt, "HH:mm")} {m.bookerName}
                      </div>
                    ))}
                    {dayMeetings.length > 3 ? (
                      <span className="text-muted-foreground text-[11px]">
                        +{dayMeetings.length - 3} more
                      </span>
                    ) : null}
                    {dayImported.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className="text-muted-foreground bg-muted truncate rounded px-1 py-0.5 text-[11px]"
                        title={`${e.isPrivate ? "Busy" : e.title} · ${e.ownerName} (Google Calendar)`}
                      >
                        {e.allDay ? "" : `${formatDateTime(e.startAt, "HH:mm")} `}
                        {e.isPrivate ? "Busy" : e.title}
                      </div>
                    ))}
                    {dayImported.length > 2 ? (
                      <span className="text-muted-foreground text-[11px]">
                        +{dayImported.length - 2} more
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
