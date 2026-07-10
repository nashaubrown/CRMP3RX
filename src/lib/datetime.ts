import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// All timestamps are stored in UTC; the UI renders Maldives time.
export const APP_TIMEZONE = "Indian/Maldives";

export function formatDateTime(date: Date | string, pattern = "d MMM yyyy, HH:mm") {
  return formatInTimeZone(new Date(date), APP_TIMEZONE, pattern);
}

export function formatDate(date: Date | string, pattern = "d MMM yyyy") {
  return formatInTimeZone(new Date(date), APP_TIMEZONE, pattern);
}

export function formatTime(date: Date | string, pattern = "HH:mm") {
  return formatInTimeZone(new Date(date), APP_TIMEZONE, pattern);
}

// Interpret a datetime-local input value ("2026-07-15T14:30") as Maldives
// wall-clock time and convert it to a UTC Date for storage.
export function parseMvLocal(value: string): Date {
  return fromZonedTime(value, APP_TIMEZONE);
}

// Inverse of parseMvLocal: format a UTC Date as a datetime-local input value
// in Maldives time.
export function toMvLocalInputValue(date: Date | string): string {
  return formatInTimeZone(new Date(date), APP_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}
