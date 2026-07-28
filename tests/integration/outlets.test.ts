import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { addOutlet, deleteOutlet, listOutlets } from "@/services/outlets";

const suffix = `outlet-${Math.random().toString(36).slice(2, 8)}`;
let owner: SessionUser;
let merchantId: string;

beforeAll(async () => {
  const u = await db.user.create({
    data: { name: "Outlet Owner", email: `owner-${suffix}@t.mv`, role: "SALES_REP" },
  });
  owner = { id: u.id, role: "SALES_REP", name: u.name };
  const m = await db.merchant.create({ data: { name: `Brand ${suffix}`, ownerId: u.id } });
  merchantId = m.id;
});

afterAll(async () => {
  await db.outlet.deleteMany({ where: { merchant: { name: { contains: suffix } } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("outlets", () => {
  it("first outlet becomes primary and syncs branch count + merchant coords", async () => {
    await addOutlet(owner, merchantId, {
      name: "Majeedhee Magu",
      address: "Malé",
      latitude: 4.175,
      longitude: 73.505,
      isPrimary: false,
    });
    const outlets = await listOutlets(merchantId);
    expect(outlets).toHaveLength(1);
    expect(outlets[0].isPrimary).toBe(true);

    const m = await db.merchant.findUnique({ where: { id: merchantId } });
    expect(m?.branches).toBe(1);
    expect(m?.latitude).toBe(4.175);
  });

  it("adding a second outlet bumps the branch count", async () => {
    await addOutlet(owner, merchantId, {
      name: "Hulhumalé",
      address: undefined,
      latitude: 4.21,
      longitude: 73.54,
      isPrimary: false,
    });
    const m = await db.merchant.findUnique({ where: { id: merchantId } });
    expect(m?.branches).toBe(2);
  });

  it("deleting the primary promotes another and re-syncs", async () => {
    const outlets = await listOutlets(merchantId);
    const primary = outlets.find((o) => o.isPrimary)!;
    await deleteOutlet(owner, primary.id);

    const remaining = await listOutlets(merchantId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isPrimary).toBe(true); // promoted

    const m = await db.merchant.findUnique({ where: { id: merchantId } });
    expect(m?.branches).toBe(1);
    expect(m?.latitude).toBe(remaining[0].latitude);
  });
});
