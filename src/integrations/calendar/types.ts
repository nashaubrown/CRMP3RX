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

// Implemented by GoogleCalendarProvider; a different provider (Outlook…)
// only needs to satisfy this interface.
export interface CalendarProvider {
  getBusy(userId: string, from: Date, to: Date): Promise<BusyInterval[]>;
  createEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventResult | null>;
  deleteEvent(userId: string, eventId: string): Promise<void>;
}
