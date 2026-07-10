"use client";

import * as React from "react";
import { useActionState } from "react";
import { CalendarPlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  scheduleMeetingAction,
  type ScheduleMeetingState,
} from "@/app/(app)/_actions/meetings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const initialState: ScheduleMeetingState = { error: null };

const DURATIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

const MANUAL = "MANUAL";

export type AttendeeOption = { name: string; email: string; phone?: string | null };

export function ScheduleMeetingDialog({
  entityType,
  entityId,
  revalidatePath,
  defaultTitle,
  attendees,
  calendarConnected,
}: {
  entityType: "MERCHANT" | "CONTACT";
  entityId: string;
  revalidatePath: string;
  defaultTitle: string;
  attendees: AttendeeOption[];
  calendarConnected: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [duration, setDuration] = React.useState("30");
  const [selected, setSelected] = React.useState(attendees.length > 0 ? "0" : MANUAL);
  const [name, setName] = React.useState(attendees[0]?.name ?? "");
  const [email, setEmail] = React.useState(attendees[0]?.email ?? "");
  const [phone, setPhone] = React.useState(attendees[0]?.phone ?? "");

  const [state, formAction, pending] = useActionState(
    async (prev: ScheduleMeetingState, formData: FormData) => {
      const result = await scheduleMeetingAction(prev, formData);
      if (result.success) {
        setOpen(false);
        toast.success(
          result.meetUrl
            ? "Meeting scheduled — added to your Google Calendar with a Meet link"
            : "Meeting scheduled"
        );
      }
      return result;
    },
    initialState
  );

  function onPickAttendee(value: string) {
    setSelected(value);
    if (value === MANUAL) {
      setName("");
      setEmail("");
      setPhone("");
    } else {
      const a = attendees[Number(value)];
      setName(a?.name ?? "");
      setEmail(a?.email ?? "");
      setPhone(a?.phone ?? "");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlusIcon /> Schedule meeting
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>
            You&apos;ll be the host. It lands on this record&apos;s timeline
            {calendarConnected
              ? " and syncs to your Google Calendar with a Meet link."
              : ". Connect Google Calendar in Settings to sync it and get a Meet link."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="revalidate" value={revalidatePath} />
          <input type="hidden" name="durationMins" value={duration} />

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input id="meeting-title" name="title" defaultValue={defaultTitle} required />
          </div>

          {attendees.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label>Attendee</Label>
              <Select value={selected} onValueChange={onPickAttendee}>
                <SelectTrigger aria-label="Attendee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {attendees.map((a, i) => (
                    <SelectItem key={a.email} value={String(i)}>
                      {a.name} — {a.email}
                    </SelectItem>
                  ))}
                  <SelectItem value={MANUAL}>Someone else…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="attendee-name">Attendee name</Label>
              <Input
                id="attendee-name"
                name="attendeeName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="attendee-email">Attendee email</Label>
              <Input
                id="attendee-email"
                name="attendeeEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attendee-phone">
              Attendee phone <span className="text-muted-foreground">(optional, for SMS)</span>
            </Label>
            <Input
              id="attendee-phone"
              name="attendeePhone"
              value={phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+960 777 1234"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-start">When (Maldives time)</Label>
              <Input id="meeting-start" name="startAtLocal" type="datetime-local" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger aria-label="Duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-notes">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="meeting-notes" name="notes" rows={2} />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <CalendarPlusIcon />}
              Schedule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
