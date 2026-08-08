import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { pointInGeofence, toGeofence, type Geofence as GeoShape, type LatLng } from "@/lib/geo";
import type { GeofenceInput } from "@/lib/validators/geofence";

export class GeofenceError extends Error {}

export type GeofenceStats = {
  total: number;
  onboarded: number; // loyalty live
  active: number; // ACTIVE but not onboarded
  prospect: number; // everything else with a pin
  mrrMvr: number; // billable MRR inside the zone
};

export type GeofenceWithStats = {
  id: string;
  name: string;
  type: "TERRITORY" | "CAMPAIGN";
  shape: "POLYGON" | "CIRCLE";
  color: string;
  points: LatLng[];
  radiusM: number | null;
  offer: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdById: string;
  stats: GeofenceStats;
};

// Points come back from Prisma as Json; narrow, then hand to the shared
// row-to-union mapper so this and the client agree on what a circle is.
function asGeoShape(g: { shape: string; points: unknown; radiusM: number | null }): GeoShape {
  return toGeofence({ shape: g.shape, points: (g.points as LatLng[]) ?? [], radiusM: g.radiusM });
}

// All zones with live counts of the merchants inside each and their billable MRR.
// Zones are a shared team artifact, so stats aren't RBAC-scoped here.
export async function listGeofencesWithStats(): Promise<GeofenceWithStats[]> {
  const [geofences, merchants, plans] = await Promise.all([
    db.geofence.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { owner: { select: { name: true } } },
    }),
    db.merchant.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        latitude: true,
        longitude: true,
        status: true,
        loyaltyLive: true,
        subscriptionPlan: true,
        branches: true,
      },
    }),
    db.optionItem.findMany({
      where: { setKey: "SUBSCRIPTION_PLAN" },
      select: { label: true, priceMvr: true, perLocation: true },
    }),
  ]);

  const priceByPlan = new Map(plans.map((p) => [p.label, p]));
  const merchantAmount = (m: (typeof merchants)[number]): number => {
    if (!m.subscriptionPlan) return 0;
    const price = priceByPlan.get(m.subscriptionPlan);
    if (!price || price.priceMvr == null) return 0;
    return price.perLocation ? price.priceMvr * Math.max(1, m.branches ?? 1) : price.priceMvr;
  };

  return geofences.map((g) => {
    const fence = asGeoShape(g);
    const stats: GeofenceStats = { total: 0, onboarded: 0, active: 0, prospect: 0, mrrMvr: 0 };
    for (const m of merchants) {
      const inside = pointInGeofence({ lat: m.latitude!, lng: m.longitude! }, fence);
      if (!inside) continue;
      stats.total += 1;
      if (m.loyaltyLive) stats.onboarded += 1;
      else if (m.status === "ACTIVE") stats.active += 1;
      else stats.prospect += 1;
      if (m.status === "ACTIVE" && m.loyaltyLive) stats.mrrMvr += merchantAmount(m);
    }
    return {
      id: g.id,
      name: g.name,
      type: g.type,
      shape: g.shape,
      color: g.color,
      points: (g.points as LatLng[]) ?? [],
      radiusM: g.radiusM,
      offer: g.offer,
      ownerId: g.ownerId,
      ownerName: g.owner?.name ?? null,
      createdById: g.createdById,
      stats,
    };
  });
}

function toData(input: GeofenceInput): Prisma.GeofenceUncheckedCreateInput | Prisma.GeofenceUncheckedUpdateInput {
  return {
    name: input.name,
    type: input.type,
    shape: input.shape,
    color: input.color,
    points: input.points as unknown as Prisma.InputJsonValue,
    radiusM: input.shape === "CIRCLE" ? (input.radiusM ?? null) : null,
    offer: input.type === "CAMPAIGN" ? (input.offer ?? null) : null,
    ownerId: input.ownerId ?? null,
  };
}

export async function createGeofence(ctx: SessionUser, input: GeofenceInput) {
  return db.geofence.create({
    data: { ...(toData(input) as Prisma.GeofenceUncheckedCreateInput), createdById: ctx.id },
  });
}

export async function updateGeofence(ctx: SessionUser, id: string, input: GeofenceInput) {
  const existing = await db.geofence.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) throw new GeofenceError("Zone not found.");
  // Any teammate can refine a zone; only the creator or an admin can't be blocked
  // here since zones are a shared planning tool.
  await db.geofence.update({ where: { id }, data: toData(input) });
}

export async function deleteGeofence(ctx: SessionUser, id: string) {
  const existing = await db.geofence.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) throw new GeofenceError("Zone not found.");
  if (existing.createdById !== ctx.id && !isAdmin(ctx)) {
    throw new GeofenceError("Only the creator or an admin can delete this zone.");
  }
  await db.geofence.delete({ where: { id } });
}
