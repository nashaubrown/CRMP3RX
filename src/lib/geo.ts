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
