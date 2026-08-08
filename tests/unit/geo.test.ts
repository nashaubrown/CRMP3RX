import { describe, expect, it } from "vitest";

import {
  fencesContaining,
  formatDistanceM,
  haversineMeters,
  pointInGeofence,
  pointInPolygon,
} from "@/lib/geo";

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

describe("fencesContaining", () => {
  // Zone rows as they reach the client: shape is the full union and radiusM is
  // nullable, so they don't narrow on their own.
  const territory = { id: "t", name: "Malé", shape: "POLYGON", points: square, radiusM: null };
  const campaign = {
    id: "c",
    name: "Ramadan push",
    shape: "CIRCLE",
    points: [{ lat: 4.175, lng: 73.505 }],
    radiusM: 400,
  };
  const zones = [territory, campaign];

  it("returns every overlapping zone, not just the first", () => {
    // Dead centre: inside the square and inside the circle drawn within it.
    const both = fencesContaining({ lat: 4.175, lng: 73.505 }, zones);
    expect(both.map((z) => z.id)).toEqual(["t", "c"]);
  });

  it("returns only the outer zone when outside the inner one", () => {
    const outer = fencesContaining({ lat: 4.1715, lng: 73.5015 }, zones);
    expect(outer.map((z) => z.id)).toEqual(["t"]);
  });

  it("returns nothing when the point is outside every zone", () => {
    expect(fencesContaining({ lat: 4.5, lng: 73.9 }, zones)).toEqual([]);
  });

  it("treats a circle with no radius as empty rather than throwing", () => {
    const broken = [{ id: "x", shape: "CIRCLE", points: [{ lat: 4.17, lng: 73.5 }], radiusM: null }];
    expect(fencesContaining({ lat: 4.17, lng: 73.5 }, broken)).toEqual([]);
  });
});

describe("formatDistanceM", () => {
  it("rounds to whole metres below a kilometre", () => {
    expect(formatDistanceM(0)).toBe("0 m");
    expect(formatDistanceM(23.4)).toBe("23 m");
    expect(formatDistanceM(999)).toBe("999 m");
  });
  it("switches to kilometres at 1000m", () => {
    expect(formatDistanceM(1000)).toBe("1.0 km");
    expect(formatDistanceM(2540)).toBe("2.5 km");
  });
  it("refuses to invent a number for a bad reading", () => {
    expect(formatDistanceM(Number.NaN)).toBe("unknown");
    expect(formatDistanceM(-5)).toBe("unknown");
  });
});
