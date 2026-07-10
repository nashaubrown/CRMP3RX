"use client";

import * as React from "react";
import { CheckCircle2Icon, Loader2Icon, VideoIcon } from "lucide-react";

import { bookMeetingAction, type BookingResult } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type DaySlots = {
  day: string; // yyyy-mm-dd (MV)
  label: string; // "Mon 13 Jul"
  slots: { iso: string; label: string }[]; // label in MV time "09:30"
};

export function BookingWidget({ slug, days }: { slug: string; days: DaySlots[] }) {
  const firstAvailable = days.find((d) => d.slots.length > 0);
  const [selectedDay, setSelectedDay] = React.useState(firstAvailable?.day ?? days[0]?.day);
  const [selectedSlot, setSelectedSlot] = React.useState<{ iso: string; label: string } | null>(
    null
  );
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState<BookingResult["confirmation"]>();
  const [pending, startTransition] = React.useTransition();

  const day = days.find((d) => d.day === selectedDay);

  if (confirmation) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2Icon className="size-12 text-emerald-500" />
        <p className="text-xl font-semibold">You&apos;re booked!</p>
        <p className="text-muted-foreground">
          {confirmation.when} (Maldives time) — a confirmation email is on its way.
        </p>
        {confirmation.meetUrl ? (
          <Button asChild>
            <a href={confirmation.meetUrl} target="_blank" rel="noreferrer">
              <VideoIcon /> Google Meet link
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  function book() {
    if (!selectedSlot) return;
    startTransition(async () => {
      const result = await bookMeetingAction({
        slug,
        startAtIso: selectedSlot.iso,
        bookerName: name,
        bookerEmail: email,
        bookerPhone: phone,
        notes,
      });
      if (result.error) setError(result.error);
      else setConfirmation(result.confirmation);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => (
          <button
            key={d.day}
            onClick={() => {
              setSelectedDay(d.day);
              setSelectedSlot(null);
            }}
            disabled={d.slots.length === 0}
            className={cn(
              "shrink-0 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-40",
              d.day === selectedDay
                ? "bg-primary text-primary-foreground border-transparent"
                : "hover:bg-accent"
            )}
          >
            <span className="block font-medium">{d.label}</span>
            <span
              className={cn(
                "text-xs",
                d.day === selectedDay ? "text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              {d.slots.length} slot{d.slots.length === 1 ? "" : "s"}
            </span>
          </button>
        ))}
      </div>

      {day && day.slots.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {day.slots.map((slot) => (
            <button
              key={slot.iso}
              onClick={() => setSelectedSlot(slot)}
              className={cn(
                "rounded-md border px-2 py-2 text-sm tabular-nums transition-colors",
                selectedSlot?.iso === slot.iso
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-accent"
              )}
            >
              {slot.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground py-4 text-center text-sm">
          No slots available on this day.
        </p>
      )}

      {selectedSlot ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            Booking {day?.label} at {selectedSlot.label} (Maldives time)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-name">Your name *</Label>
              <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-email">Email *</Label>
              <Input
                id="b-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="b-phone">Phone (for SMS confirmation)</Label>
              <Input
                id="b-phone"
                placeholder="+960 777 1234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="b-notes">Anything we should know?</Label>
              <Textarea
                id="b-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={book} disabled={pending || !name.trim() || !email.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            Confirm booking
          </Button>
        </div>
      ) : null}
    </div>
  );
}
