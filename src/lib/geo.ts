// Pure geo helpers for geofencing — no map SDK, fully unit-testable.

export type LatLng = { lat: number; lng: number };

// Ray-casting point-in-polygon. `polygon` is an ordered ring of vertices
// (first/last need not repeat). Returns true if the point is inside.
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  const { lat: y, lng: x } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

// Great-circle distance between two points, in meters (haversine).
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export type Geofence =
  | { shape: "POLYGON"; points: LatLng[] }
  | { shape: "CIRCLE"; points: LatLng[]; radiusM: number };

// True if a point falls inside a geofence (polygon or circle).
export function pointInGeofence(point: LatLng, fence: Geofence): boolean {
  if (fence.shape === "CIRCLE") {
    const center = fence.points[0];
    if (!center || !fence.radiusM) return false;
    return haversineMeters(point, center) <= fence.radiusM;
  }
  return pointInPolygon(point, fence.points);
}

// Stored zones keep shape, points and radius in separate nullable columns, so
// they don't narrow to the union above on their own. Everything that holds a
// zone row goes through here first.
export type GeofenceRow = { shape: string; points: LatLng[]; radiusM?: number | null };

export function toGeofence(row: GeofenceRow): Geofence {
  return row.shape === "CIRCLE"
    ? { shape: "CIRCLE", points: row.points, radiusM: row.radiusM ?? 0 }
    : { shape: "POLYGON", points: row.points };
}

// Every zone containing the point, in the order given. Zones are allowed to
// overlap — a campaign zone often sits inside a territory — so this returns a
// list rather than a first match.
export function fencesContaining<T extends GeofenceRow>(point: LatLng, rows: T[]): T[] {
  return rows.filter((row) => pointInGeofence(point, toGeofence(row)));
}

// Distances for people standing in the street: whole metres up to a kilometre,
// then one decimal. GPS precision never justifies more than that.
export function formatDistanceM(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "unknown";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
