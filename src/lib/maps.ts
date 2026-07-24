// Google Maps configuration. The API key is a NEXT_PUBLIC value on purpose —
// Maps JS keys are meant to be used client-side and restricted by HTTP referrer
// in the Google Cloud console (not a secret like the AI key). Everything here
// degrades gracefully to a manual lat/long entry when no key is set.

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// AdvancedMarker + Pin require a Map ID. Google's DEMO_MAP_ID works out of the
// box; set your own for custom styling.
export const GOOGLE_MAPS_MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export const MAPS_ENABLED = GOOGLE_MAPS_API_KEY.length > 0;

// Malé, Maldives — sensible default center/zoom for a fresh map.
export const DEFAULT_CENTER = { lat: 4.1755, lng: 73.5093 };
export const DEFAULT_ZOOM = 12;

export type MerchantPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  onboarded: boolean; // loyalty program live
  status: string;
  subscriptionPlan: string | null;
};

// Pin colors: green = onboarded (loyalty live), amber = active, grey otherwise.
export function pinColors(pin: { onboarded: boolean; status: string }) {
  if (pin.onboarded) return { background: "#16a34a", glyph: "#ffffff", border: "#15803d" };
  if (pin.status === "ACTIVE") return { background: "#f59e0b", glyph: "#ffffff", border: "#d97706" };
  return { background: "#94a3b8", glyph: "#ffffff", border: "#64748b" };
}
