export type BusyInterval = { start: Date; end: Date };

export type CalendarEventInput = {
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendees: { email: string; displayName?: string }[];
  // Ask the provider to attach a video-conference link
  withMeet?: boolean;
};

export type CalendarEventResult = {
  eventId: string;
  meetUrl: string | null;
};

// One event as the provider reports it. `cancelled` means "deleted upstream" —
// incremental sync reports removals this way rather than omitting them.
export type FetchedEvent = {
  externalId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  isPrivate: boolean;
  attendees: { email: string; displayName?: string }[];
  htmlLink?: string | null;
  meetUrl?: string | null;
  organizerEmail?: string | null;
  cancelled: boolean;
};

// Result of one incremental pull. `syncToken` is the cursor to hand back next
// time; `reset` says the old cursor expired and this page is a fresh full pull,
// so the caller should clear anything it no longer saw.
export type FetchedEventPage = {
  events: FetchedEvent[];
  syncToken: string | null;
  reset: boolean;
};

// Implemented by GoogleCalendarProvider; a different provider (Outlook…)
// only needs to satisfy this interface.
export interface CalendarProvider {
  getBusy(userId: string, from: Date, to: Date): Promise<BusyInterval[]>;
  createEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventResult | null>;
  deleteEvent(userId: string, eventId: string): Promise<void>;
  // Pull events changed since `syncToken`; a null token means a full pull from
  // `since`. Returns null when the user has no calendar connected.
  listEvents(
    userId: string,
    opts: { syncToken: string | null; since: Date }
  ): Promise<FetchedEventPage | null>;
}
