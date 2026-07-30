import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import {
  getAffiliateReport,
  getCommissionLedger,
  monthsInRange,
  recordCommissionsForPeriod,
  setCommissionStatus,
} from "@/services/affiliates";

// Verifies affiliate commission: recurring % of each referred *billable*
// (Active + loyalty-live, priced) merchant's MRR, and the range total =
// monthly commission × months in range. The report is a global aggregate, so
// we assert against the affiliate we create here (robust to seeded data).

const suffix = `aff-${Math.random().toString(36).slice(2, 8)}`;
const period = "2099-03"; // far-future period, unique to this test run
let repId: string;
let affId: string;
let admin: SessionUser;

beforeAll(async () => {
  const rep = await db.user.create({
    data: { name: `Aff Rep ${suffix}`, email: `rep-${suffix}@t.mv`, role: "SALES_REP" },
  });
  repId = rep.id;
  const adminUser = await db.user.create({
    data: { name: `Aff Admin ${suffix}`, email: `admin-${suffix}@t.mv`, role: "ADMIN" },
  });
  admin = { id: adminUser.id, role: "ADMIN", name: adminUser.name };

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
  await db.affiliateCommission.deleteMany({ where: { affiliateId: affId } });
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

describe("commission ledger", () => {
  it("records a snapshot, marks it paid, and preserves paid on re-record", async () => {
    // Record the period — snapshots the current monthly commission (260).
    const rec = await recordCommissionsForPeriod(admin, period);
    expect(rec.recorded).toBeGreaterThanOrEqual(1);

    let ledger = await getCommissionLedger(period);
    const entry = ledger.entries.find((e) => e.affiliateId === affId)!;
    expect(entry).toBeDefined();
    expect(entry.amountMvr).toBe(260);
    expect(entry.status).toBe("PENDING");
    expect(ledger.pendingMvr).toBeGreaterThanOrEqual(260);

    // Mark it paid.
    await setCommissionStatus(admin, entry.id, "PAID");
    ledger = await getCommissionLedger(period);
    const paid = ledger.entries.find((e) => e.affiliateId === affId)!;
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).not.toBeNull();

    // Re-recording must not overwrite an already-paid entry.
    const rec2 = await recordCommissionsForPeriod(admin, period);
    expect(rec2.skippedPaid).toBeGreaterThanOrEqual(1);
    ledger = await getCommissionLedger(period);
    expect(ledger.entries.find((e) => e.affiliateId === affId)!.status).toBe("PAID");
  });

  it("rejects recording by a non-admin", async () => {
    const rep: SessionUser = { id: repId, role: "SALES_REP", name: "rep" };
    await expect(recordCommissionsForPeriod(rep, period)).rejects.toThrow();
  });
});
