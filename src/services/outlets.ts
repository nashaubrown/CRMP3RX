import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import type { OutletInput } from "@/lib/validators/outlet";
import { assertMerchantEdit } from "@/services/merchant-access";

export class OutletError extends Error {}

export function listOutlets(merchantId: string) {
  return db.outlet.findMany({
    where: { merchantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

// Keeps the merchant's denormalized fields in step with its outlets: branch
// count = number of outlets, and the primary outlet's coordinates mirror onto
// the merchant (so the existing map/geofence/billing code keeps working).
async function syncMerchantFromOutlets(merchantId: string) {
  const outlets = await db.outlet.findMany({
    where: { merchantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  // Ensure exactly one primary.
  if (outlets.length > 0 && !outlets.some((o) => o.isPrimary)) {
    await db.outlet.update({ where: { id: outlets[0].id }, data: { isPrimary: true } });
    outlets[0].isPrimary = true;
  }

  const primary = outlets.find((o) => o.isPrimary);
  const located = outlets.filter((o) => o.latitude != null && o.longitude != null);
  const coordSource = primary?.latitude != null ? primary : located[0];

  await db.merchant.update({
    where: { id: merchantId },
    data: {
      branches: outlets.length > 0 ? outlets.length : null,
      latitude: coordSource?.latitude ?? null,
      longitude: coordSource?.longitude ?? null,
    },
  });
}

export async function addOutlet(ctx: SessionUser, merchantId: string, input: OutletInput) {
  await assertMerchantEdit(ctx, merchantId);
  const count = await db.outlet.count({ where: { merchantId } });
  const makePrimary = input.isPrimary || count === 0; // first outlet is primary

  await db.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.outlet.updateMany({ where: { merchantId }, data: { isPrimary: false } });
    }
    await tx.outlet.create({
      data: {
        merchantId,
        name: input.name,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isPrimary: makePrimary,
      },
    });
  });
  await syncMerchantFromOutlets(merchantId);
}

export async function updateOutlet(ctx: SessionUser, outletId: string, input: OutletInput) {
  const outlet = await db.outlet.findUnique({ where: { id: outletId }, select: { merchantId: true } });
  if (!outlet) throw new OutletError("Outlet not found.");
  await assertMerchantEdit(ctx, outlet.merchantId);

  await db.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.outlet.updateMany({ where: { merchantId: outlet.merchantId }, data: { isPrimary: false } });
    }
    await tx.outlet.update({
      where: { id: outletId },
      data: {
        name: input.name,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isPrimary: input.isPrimary || false,
      },
    });
  });
  await syncMerchantFromOutlets(outlet.merchantId);
}

export async function deleteOutlet(ctx: SessionUser, outletId: string) {
  const outlet = await db.outlet.findUnique({ where: { id: outletId }, select: { merchantId: true } });
  if (!outlet) throw new OutletError("Outlet not found.");
  await assertMerchantEdit(ctx, outlet.merchantId);
  await db.outlet.delete({ where: { id: outletId } });
  await syncMerchantFromOutlets(outlet.merchantId);
}

// Used at merchant creation to seed the primary outlet from the form's location.
export async function createPrimaryOutlet(
  merchantId: string,
  data: { name: string; address?: string | null; latitude?: number | null; longitude?: number | null }
) {
  await db.outlet.create({
    data: {
      merchantId,
      name: data.name,
      address: data.address ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      isPrimary: true,
    },
  });
  await syncMerchantFromOutlets(merchantId);
}
