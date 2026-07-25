import { describe, expect, it } from "vitest";

import { haversineMeters, pointInGeofence, pointInPolygon } from "@/lib/geo";

// A rough square around central Malé.
const square = [
  { lat: 4.17, lng: 73.5 },
  { lat: 4.18, lng: 73.5 },
  { lat: 4.18, lng: 73.51 },
  { lat: 4.17, lng: 73.51 },
];

describe("pointInPolygon", () => {
  it("detects a point inside", () => {
    expect(pointInPolygon({ lat: 4.175, lng: 73.505 }, square)).toBe(true);
  });
  it("detects a point outside", () => {
    expect(pointInPolygon({ lat: 4.2, lng: 73.52 }, square)).toBe(false);
  });
  it("returns false for a degenerate polygon", () => {
    expect(pointInPolygon({ lat: 4.175, lng: 73.505 }, square.slice(0, 2))).toBe(false);
  });
});

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMeters({ lat: 4.17, lng: 73.5 }, { lat: 4.17, lng: 73.5 })).toBeLessThan(1);
  });
  it("approximates a known short distance", () => {
    // ~1.11 km per 0.01° of latitude.
    const d = haversineMeters({ lat: 4.17, lng: 73.5 }, { lat: 4.18, lng: 73.5 });
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1160);
  });
});

describe("pointInGeofence", () => {
  it("handles circles by radius", () => {
    const fence = { shape: "CIRCLE" as const, points: [{ lat: 4.17, lng: 73.5 }], radiusM: 500 };
    expect(pointInGeofence({ lat: 4.171, lng: 73.5 }, fence)).toBe(true); // ~111m away
    expect(pointInGeofence({ lat: 4.19, lng: 73.5 }, fence)).toBe(false); // ~2.2km away
  });
  it("handles polygons", () => {
    const fence = { shape: "POLYGON" as const, points: square };
    expect(pointInGeofence({ lat: 4.175, lng: 73.505 }, fence)).toBe(true);
    expect(pointInGeofence({ lat: 4.0, lng: 73.0 }, fence)).toBe(false);
  });
});
