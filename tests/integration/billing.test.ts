import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { getBilling } from "@/services/billing";

// Verifies MRR: only Active + loyalty-live merchants on a priced plan count,
// and per-location plans multiply by branch count.

const suffix = `bill-${Math.random().toString(36).slice(2, 8)}`;
let admin: SessionUser;

beforeAll(async () => {
  const adminUser = await db.user.create({
    data: { name: "Bill Admin", email: `admin-${suffix}@t.mv`, role: "ADMIN" },
  });
  admin = { id: adminUser.id, role: "ADMIN", name: adminUser.name };

  // Priced plans scoped to this test (unique labels).
  await db.optionItem.createMany({
    data: [
      { setKey: "SUBSCRIPTION_PLAN", label: `Starter ${suffix}`, priceMvr: 599, perLocation: false },
      { setKey: "SUBSCRIPTION_PLAN", label: `Ent ${suffix}`, priceMvr: 1000, perLocation: true },
    ],
  });

  await db.merchant.createMany({
    data: [
      // Billable: Starter, active + loyalty live → 599
      { name: `A ${suffix}`, ownerId: adminUser.id, status: "ACTIVE", loyaltyLive: true, subscriptionPlan: `Starter ${suffix}` },
      // Billable: Enterprise, 3 branches → 3000
      { name: `B ${suffix}`, ownerId: adminUser.id, status: "ACTIVE", loyaltyLive: true, subscriptionPlan: `Ent ${suffix}`, branches: 3 },
      // Enterprise, no branch count → counts as 1 → 1000
      { name: `C ${suffix}`, ownerId: adminUser.id, status: "ACTIVE", loyaltyLive: true, subscriptionPlan: `Ent ${suffix}` },
      // Excluded: active but loyalty not live
      { name: `D ${suffix}`, ownerId: adminUser.id, status: "ACTIVE", loyaltyLive: false, subscriptionPlan: `Starter ${suffix}` },
      // Excluded: loyalty live but not active
      { name: `E ${suffix}`, ownerId: adminUser.id, status: "PROSPECT", loyaltyLive: true, subscriptionPlan: `Starter ${suffix}` },
    ],
  });
});

afterAll(async () => {
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.optionItem.deleteMany({ where: { label: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("billing (MRR)", () => {
  it("sums only billable merchants, multiplying per-location plans by branches", async () => {
    const billing = await getBilling(admin);
    // 599 (Starter) + 3000 (Ent×3) + 1000 (Ent×1) = 4599
    expect(billing.totalMrr).toBe(4599);
    expect(billing.merchantCount).toBe(3);

    const ent = billing.lines.find((l) => l.plan === `Ent ${suffix}`)!;
    expect(ent.perLocation).toBe(true);
    expect(ent.count).toBe(2);
    expect(ent.subtotalMvr).toBe(4000);

    const starter = billing.lines.find((l) => l.plan === `Starter ${suffix}`)!;
    expect(starter.subtotalMvr).toBe(599);
  });

  it("reports ARR and near-term pipeline upside", async () => {
    const billing = await getBilling(admin);
    // ARR = MRR × 12
    expect(billing.arrMvr).toBe(4599 * 12);
    // ARPA = 4599 / 3 billable, rounded
    expect(billing.arpaMvr).toBe(Math.round(4599 / 3));
    // Merchants D (active, loyalty off) and E (prospect, loyalty on) are on a
    // plan but not billable and not churned → pipeline: 599 + 599.
    expect(billing.pipelineCount).toBe(2);
    expect(billing.pipelineMrr).toBe(1198);
  });
});
