import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { getOwnerBreakdown } from "@/services/dashboard";

// Verifies the per-owner dashboard breakdown: status counts, onboarded count
// (Active + loyalty live) and MRR per owner. The breakdown is a global
// aggregate, so we assert against the row for a rep we create here — robust to
// any other data already in the shared DB.

const suffix = `own-${Math.random().toString(36).slice(2, 8)}`;
let repId: string;
// The breakdown is team-wide data, so it's fetched as an admin — they always
// hold canSeeTeamNumbers. permissions.test.ts covers a rep being refused.
const admin: SessionUser = { id: "seed-admin", role: "ADMIN", name: "A", email: "a@t.mv" };

beforeAll(async () => {
  const rep = await db.user.create({
    data: { name: `Owner Rep ${suffix}`, email: `rep-${suffix}@t.mv`, role: "SALES_REP" },
  });
  repId = rep.id;

  await db.optionItem.createMany({
    data: [
      { setKey: "SUBSCRIPTION_PLAN", label: `Starter ${suffix}`, priceMvr: 599, perLocation: false },
      { setKey: "SUBSCRIPTION_PLAN", label: `Ent ${suffix}`, priceMvr: 1000, perLocation: true },
    ],
  });

  await db.merchant.createMany({
    data: [
      // Onboarded + billable: Starter → 599
      { name: `A ${suffix}`, ownerId: repId, status: "ACTIVE", loyaltyLive: true, subscriptionPlan: `Starter ${suffix}` },
      // Onboarded + billable: Enterprise × 2 branches → 2000
      { name: `B ${suffix}`, ownerId: repId, status: "ACTIVE", loyaltyLive: true, subscriptionPlan: `Ent ${suffix}`, branches: 2 },
      // Active but not onboarded (loyalty off) — counts as active, not onboarded/MRR
      { name: `C ${suffix}`, ownerId: repId, status: "ACTIVE", loyaltyLive: false, subscriptionPlan: `Starter ${suffix}` },
      // Prospects
      { name: `D ${suffix}`, ownerId: repId, status: "PROSPECT", loyaltyLive: false },
      { name: `E ${suffix}`, ownerId: repId, status: "PROSPECT", loyaltyLive: false },
      // Churned
      { name: `F ${suffix}`, ownerId: repId, status: "CHURNED", loyaltyLive: false },
    ],
  });
});

afterAll(async () => {
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.optionItem.deleteMany({ where: { label: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("owner breakdown", () => {
  it("groups a rep's merchants by status with onboarded count and MRR", async () => {
    const { rows } = (await getOwnerBreakdown(admin))!;
    const row = rows.find((r) => r.ownerId === repId)!;

    expect(row).toBeDefined();
    expect(row.prospect).toBe(2);
    expect(row.active).toBe(3); // A, B, C
    expect(row.churned).toBe(1);
    expect(row.total).toBe(6);
    // Onboarded = Active + loyalty live → A, B
    expect(row.onboarded).toBe(2);
    // MRR = 599 (Starter) + 2000 (Ent × 2 branches) = 2599
    expect(row.mrrMvr).toBe(2599);
  });

  it("returns rows sorted by total merchants descending", async () => {
    const { rows } = (await getOwnerBreakdown(admin))!;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].total).toBeGreaterThanOrEqual(rows[i].total);
    }
  });
});
