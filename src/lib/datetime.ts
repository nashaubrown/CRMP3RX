import { formatInTimeZone } from "date-fns-tz";

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
