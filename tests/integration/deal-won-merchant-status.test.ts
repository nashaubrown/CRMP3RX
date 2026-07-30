import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { moveDealStage } from "@/services/deals";

// Verifies the deal→merchant status automation: winning a deal activates its
// merchant (Prospect or Churned → Active), and moving the deal back out of Won
// reverts the merchant to Prospect only when it has no other won deals.

const suffix = `dwon-${Math.random().toString(36).slice(2, 8)}`;
let rep: SessionUser;
let repId: string;

async function newMerchant(name: string, status: "PROSPECT" | "ACTIVE" | "CHURNED") {
  return db.merchant.create({
    data: { name: `${name} ${suffix}`, ownerId: repId, status },
  });
}
async function newDeal(merchantId: string, stage: "NEW" | "WON" = "NEW") {
  return db.deal.create({
    data: { title: `Deal ${suffix}`, merchantId, ownerId: repId, value: 1000, currency: "MVR", stage },
  });
}
function status(id: string) {
  return db.merchant.findUnique({ where: { id }, select: { status: true } }).then((m) => m!.status);
}

beforeAll(async () => {
  const u = await db.user.create({
    data: { name: `Deal Rep ${suffix}`, email: `rep-${suffix}@t.mv`, role: "SALES_REP" },
  });
  repId = u.id;
  rep = { id: u.id, role: "SALES_REP", name: u.name };
});

afterAll(async () => {
  await db.deal.deleteMany({ where: { title: { contains: suffix } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("won deal activates the merchant", () => {
  it("flips a Prospect merchant to Active", async () => {
    const m = await newMerchant("Prospecto", "PROSPECT");
    const d = await newDeal(m.id);
    await moveDealStage(rep, d.id, "WON");
    expect(await status(m.id)).toBe("ACTIVE");
  });

  it("wins back a Churned merchant to Active", async () => {
    const m = await newMerchant("Churny", "CHURNED");
    const d = await newDeal(m.id);
    await moveDealStage(rep, d.id, "WON");
    expect(await status(m.id)).toBe("ACTIVE");
  });

  it("reverts to Prospect when the only won deal is un-won", async () => {
    const m = await newMerchant("Reverto", "PROSPECT");
    const d = await newDeal(m.id);
    await moveDealStage(rep, d.id, "WON");
    expect(await status(m.id)).toBe("ACTIVE");
    await moveDealStage(rep, d.id, "LOST", "Changed their mind");
    expect(await status(m.id)).toBe("PROSPECT");
  });

  it("does not revert while another won deal remains", async () => {
    const m = await newMerchant("Sticky", "PROSPECT");
    const d1 = await newDeal(m.id);
    const d2 = await newDeal(m.id);
    await moveDealStage(rep, d1.id, "WON");
    await moveDealStage(rep, d2.id, "WON");
    expect(await status(m.id)).toBe("ACTIVE");
    // Un-win one — the other keeps the merchant Active.
    await moveDealStage(rep, d1.id, "PROPOSAL");
    expect(await status(m.id)).toBe("ACTIVE");
  });
});
