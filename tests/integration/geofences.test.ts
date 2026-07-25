import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import {
  createGeofence,
  deleteGeofence,
  GeofenceError,
  listGeofencesWithStats,
} from "@/services/geofences";

const suffix = `geo-${Math.random().toString(36).slice(2, 8)}`;
let admin: SessionUser;
let rep: SessionUser;

beforeAll(async () => {
  const [a, r] = await Promise.all([
    db.user.create({ data: { name: "Geo Admin", email: `admin-${suffix}@t.mv`, role: "ADMIN" } }),
    db.user.create({ data: { name: "Geo Rep", email: `rep-${suffix}@t.mv`, role: "SALES_REP" } }),
  ]);
  admin = { id: a.id, role: "ADMIN", name: a.name };
  rep = { id: r.id, role: "SALES_REP", name: r.name };

  await db.optionItem.create({
    data: { setKey: "SUBSCRIPTION_PLAN", label: `Growth ${suffix}`, priceMvr: 799, perLocation: false },
  });

  // One onboarded merchant inside the test square, one far outside.
  await db.merchant.createMany({
    data: [
      {
        name: `Inside ${suffix}`,
        ownerId: r.id,
        status: "ACTIVE",
        loyaltyLive: true,
        subscriptionPlan: `Growth ${suffix}`,
        latitude: 4.175,
        longitude: 73.505,
      },
      {
        name: `Outside ${suffix}`,
        ownerId: r.id,
        status: "ACTIVE",
        loyaltyLive: true,
        subscriptionPlan: `Growth ${suffix}`,
        latitude: 4.3,
        longitude: 73.7,
      },
    ],
  });
});

afterAll(async () => {
  await db.geofence.deleteMany({ where: { name: { contains: suffix } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.optionItem.deleteMany({ where: { label: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("geofences", () => {
  it("counts merchants inside a polygon and sums their MRR", async () => {
    await createGeofence(rep, {
      name: `Zone ${suffix}`,
      type: "TERRITORY",
      shape: "POLYGON",
      color: "#16a34a",
      points: [
        { lat: 4.17, lng: 73.5 },
        { lat: 4.18, lng: 73.5 },
        { lat: 4.18, lng: 73.51 },
        { lat: 4.17, lng: 73.51 },
      ],
      radiusM: null,
      offer: null,
      ownerId: rep.id,
    });

    const zones = await listGeofencesWithStats();
    const zone = zones.find((z) => z.name === `Zone ${suffix}`)!;
    expect(zone.stats.total).toBe(1); // only the inside merchant
    expect(zone.stats.onboarded).toBe(1);
    expect(zone.stats.mrrMvr).toBe(799);
    expect(zone.ownerName).toBe("Geo Rep");
  });

  it("only the creator or an admin can delete", async () => {
    const other = await db.user.create({
      data: { name: "Other", email: `other-${suffix}@t.mv`, role: "SALES_REP" },
    });
    const g = await createGeofence(rep, {
      name: `Deleteme ${suffix}`,
      type: "CAMPAIGN",
      shape: "CIRCLE",
      color: "#16a34a",
      points: [{ lat: 4.17, lng: 73.5 }],
      radiusM: 500,
      offer: "Test offer",
      ownerId: null,
    });
    await expect(
      deleteGeofence({ id: other.id, role: "SALES_REP", name: "Other" }, g.id)
    ).rejects.toThrow(GeofenceError);
    await deleteGeofence(rep, g.id); // creator can
    expect(await db.geofence.findUnique({ where: { id: g.id } })).toBeNull();
  });
});
