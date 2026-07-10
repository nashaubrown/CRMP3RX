// Explicit /min import: guarantees bundled metadata regardless of how the
// package's conditional exports resolve under different runtimes.
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

// Normalize user input to E.164, defaulting to the Maldives (+960).
// Returns null when the input can't be parsed as a valid number.
export function toE164(input: string): string | null {
  try {
    const parsed = parsePhoneNumberFromString(input.trim(), "MV");
    if (!parsed?.isValid()) return null;
    return parsed.number;
  } catch {
    return null;
  }
}

export function formatPhone(e164: string): string {
  try {
    const parsed = parsePhoneNumberFromString(e164);
    return parsed ? parsed.formatInternational() : e164;
  } catch {
    return e164;
  }
}
