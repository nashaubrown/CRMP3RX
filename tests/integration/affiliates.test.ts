import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { getAffiliateReport, monthsInRange } from "@/services/affiliates";

// Verifies affiliate commission: recurring % of each referred *billable*
// (Active + loyalty-live, priced) merchant's MRR, and the range total =
// monthly commission × months in range. The report is a global aggregate, so
// we assert against the affiliate we create here (robust to seeded data).

const suffix = `aff-${Math.random().toString(36).slice(2, 8)}`;
let repId: string;
let affId: string;

beforeAll(async () => {
  const rep = await db.user.create({
    data: { name: `Aff Rep ${suffix}`, email: `rep-${suffix}@t.mv`, role: "SALES_REP" },
  });
  repId = rep.id;

  await db.optionItem.createMany({
    data: [
      { setKey: "SUBSCRIPTION_PLAN", label: `Starter ${suffix}`, priceMvr: 600, perLocation: false },
      { setKey: "SUBSCRIPTION_PLAN", label: `Ent ${suffix}`, priceMvr: 1000, perLocation: true },
    ],
  });

  const aff = await db.affiliate.create({
    data: { name: `Partner ${suffix}`, commissionRate: 10 },
  });
  affId = aff.id;

  await db.merchant.createMany({
    data: [
      // Billable Starter → MRR 600
      { name: `A ${suffix}`, ownerId: repId, affiliateId: affId, status: "ACTIVE", loyaltyLive: true, subscriptionPlan: `Starter ${suffix}` },
      // Billable Enterprise × 2 branches → MRR 2000
      { name: `B ${suffix}`, ownerId: repId, affiliateId: affId, status: "ACTIVE", loyaltyLive: true, subscriptionPlan: `Ent ${suffix}`, branches: 2 },
      // Referred but not live → counts as "brought", not "onboarded"/commission
      { name: `C ${suffix}`, ownerId: repId, affiliateId: affId, status: "PROSPECT", loyaltyLive: false, subscriptionPlan: `Starter ${suffix}` },
    ],
  });
});

afterAll(async () => {
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.affiliate.deleteMany({ where: { id: affId } });
  await db.optionItem.deleteMany({ where: { label: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("monthsInRange", () => {
  it("counts inclusive whole months, minimum 1", () => {
    expect(monthsInRange("2026-01", "2026-01")).toBe(1);
    expect(monthsInRange("2026-01", "2026-06")).toBe(6);
    expect(monthsInRange("2025-11", "2026-02")).toBe(4);
    // Reversed range clamps to 1.
    expect(monthsInRange("2026-06", "2026-01")).toBe(1);
  });
});

describe("affiliate commission report", () => {
  it("commissions only billable referred merchants, at the affiliate's rate", async () => {
    const report = await getAffiliateReport(1);
    const row = report.rows.find((r) => r.affiliateId === affId)!;

    expect(row).toBeDefined();
    expect(row.merchantsBrought).toBe(3); // A, B, C
    expect(row.onboarded).toBe(2); // A, B
    // MRR = 600 + 2000 = 2600; 10% = 260 / month
    expect(row.monthlyMrrMvr).toBe(2600);
    expect(row.monthlyCommissionMvr).toBe(260);
    expect(row.rangeCommissionMvr).toBe(260); // 1 month
  });

  it("multiplies the monthly commission by the number of months in range", async () => {
    const report = await getAffiliateReport(6);
    const row = report.rows.find((r) => r.affiliateId === affId)!;
    expect(row.rangeCommissionMvr).toBe(260 * 6);
  });
});
