"use client";

import * as React from "react";
import { Loader2Icon, VideoIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { cancelMeetingAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";

export type MeetingItem = {
  id: string;
  title: string;
  bookerName: string;
  bookerEmail: string;
  when: string; // formatted MV time
  meetUrl: string | null;
  host?: string; // shown in the team agenda
  canCancel?: boolean; // host or admin only
};

export function MeetingList({ meetings }: { meetings: MeetingItem[] }) {
  const [pending, startTransition] = React.useTransition();

  if (meetings.length === 0) {
    return <p className="text-muted-foreground text-sm">No upcoming meetings.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {meetings.map((meeting) => (
        <div key={meeting.id} className="flex items-start justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{meeting.bookerName}</p>
            <p className="text-muted-foreground text-xs">
              {meeting.when} · {meeting.bookerEmail}
              {meeting.host ? <> · with {meeting.host}</> : null}
            </p>
            {meeting.meetUrl ? (
              <a
                href={meeting.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
              >
                <VideoIcon className="mr-1 inline size-3" />
                Google Meet
              </a>
            ) : null}
          </div>
          {meeting.canCancel === false ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await cancelMeetingAction(meeting.id);
                  if (result.error) toast.error(result.error);
                  else toast.success("Meeting cancelled — booker notified");
                })
              }
            >
              {pending ? <Loader2Icon className="animate-spin" /> : <XIcon />}
              Cancel
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
