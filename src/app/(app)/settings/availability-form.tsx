"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { saveAvailabilityAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayRule = { enabled: boolean; start: string; end: string };

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function AvailabilityForm({
  initial,
}: {
  initial: {
    bookingSlug: string;
    slotDurationMins: number;
    bufferMins: number;
    rules: { dayOfWeek: number; startMinutes: number; endMinutes: number }[];
  };
}) {
  const [slug, setSlug] = React.useState(initial.bookingSlug);
  const [duration, setDuration] = React.useState(String(initial.slotDurationMins));
  const [buffer, setBuffer] = React.useState(String(initial.bufferMins));
  const [days, setDays] = React.useState<DayRule[]>(() =>
    DAYS.map((_, i) => {
      const rule = initial.rules.find((r) => r.dayOfWeek === i);
      return rule
        ? { enabled: true, start: toTime(rule.startMinutes), end: toTime(rule.endMinutes) }
        : { enabled: false, start: "09:00", end: "17:00" };
    })
  );
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveAvailabilityAction({
        bookingSlug: slug,
        slotDurationMins: Number(duration),
        bufferMins: Number(buffer),
        rules: days
          .map((d, i) => ({ day: d, i }))
          .filter(({ day }) => day.enabled)
          .map(({ day, i }) => ({
            dayOfWeek: i,
            startMinutes: toMinutes(day.start),
            endMinutes: toMinutes(day.end),
          })),
      });
      if (result.error) toast.error(result.error);
      else toast.success("Availability saved");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Booking link</Label>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-sm">/book/</span>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="duration">Slot length</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger id="duration" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[15, 30, 45, 60].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="buffer">Buffer between meetings</Label>
          <Select value={buffer} onValueChange={setBuffer}>
            <SelectTrigger id="buffer" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 10, 15, 30].map((b) => (
                <SelectItem key={b} value={String(b)}>
                  {b} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Weekly hours (Maldives time)</Label>
        {DAYS.map((name, i) => (
          <div key={name} className="flex flex-wrap items-center gap-3">
            <label className="flex w-32 items-center gap-2 text-sm">
              <Checkbox
                checked={days[i].enabled}
                onCheckedChange={(checked) =>
                  setDays((d) => d.map((day, j) => (j === i ? { ...day, enabled: !!checked } : day)))
                }
              />
              {name}
            </label>
            {days[i].enabled ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-28"
                  value={days[i].start}
                  onChange={(e) =>
                    setDays((d) => d.map((day, j) => (j === i ? { ...day, start: e.target.value } : day)))
                  }
                  aria-label={`${name} start`}
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="time"
                  className="w-28"
                  value={days[i].end}
                  onChange={(e) =>
                    setDays((d) => d.map((day, j) => (j === i ? { ...day, end: e.target.value } : day)))
                  }
                  aria-label={`${name} end`}
                />
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Unavailable</span>
            )}
          </div>
        ))}
      </div>

      <div>
        <Button onClick={save} disabled={pending || !slug}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Save availability
        </Button>
      </div>
    </div>
  );
}
