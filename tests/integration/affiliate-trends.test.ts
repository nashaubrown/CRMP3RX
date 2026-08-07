import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { generateAffiliateCode } from "@/lib/affiliate-code";
import {
  currentPeriodMv,
  getPortalOverview,
  recentPeriods,
  TREND_MONTHS,
} from "@/services/affiliate-portal";

// The dashboard sparklines have to be honest: merchant counts come from when
// each referral was actually created, earnings from the recorded ledger, and
// the current month from the same live projection the rest of the portal
// shows. Nothing interpolated.

const suffix = `trend-${Math.random().toString(36).slice(2, 8)}`;
let affiliateId: string;
let adminId: string;

// Months relative to now, as "YYYY-MM".
function periodAgo(monthsBack: number): string {
  const [y, m] = currentPeriodMv().split("-").map(Number);
  const index = y * 12 + (m - 1) - monthsBack;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// A date safely inside the given period (mid-month, so the UTC/Maldives
// offset can't push it into a neighbouring month).
function midMonth(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15, 12, 0, 0));
}

beforeAll(async () => {
  const admin = await db.user.create({
    data: { name: `Trend Admin ${suffix}`, email: `trend-admin-${suffix}@t.mv`, role: "ADMIN" },
  });
  adminId = admin.id;

  const affiliate = await db.affiliate.create({
    data: {
      name: `Trend Affiliate ${suffix}`,
      code: generateAffiliateCode(),
      commissionRate: 10,
      active: true,
      applicationStatus: "APPROVED",
    },
  });
  affiliateId = affiliate.id;
});

describe("recentPeriods", () => {
  it("returns `count` months ending with the given period, oldest first", () => {
    expect(recentPeriods(6, "2026-08")).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("crosses the year boundary correctly", () => {
    expect(recentPeriods(4, "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("defaults to the current Maldives month as the last entry", () => {
    const months = recentPeriods();
    expect(months).toHaveLength(TREND_MONTHS);
    expect(months[months.length - 1]).toBe(currentPeriodMv());
  });
});

describe("dashboard trends", () => {
  it("builds cumulative merchants and per-month earnings from real records", async () => {
    const owner = await db.user.create({
      data: { name: `Trend Rep ${suffix}`, email: `trend-rep-${suffix}@t.mv` },
    });

    // Two merchants referred three months ago, one this month.
    const threeMonthsAgo = midMonth(periodAgo(3));
    for (const [i, when] of [threeMonthsAgo, threeMonthsAgo, new Date()].entries()) {
      await db.merchant.create({
        data: {
          name: `Trend Merchant ${i} ${suffix}`,
          ownerId: owner.id,
          affiliateId,
          createdAt: when,
        },
      });
    }

    // A recorded commission two months ago; the current month stays a projection.
    await db.affiliateCommission.create({
      data: {
        affiliateId,
        period: periodAgo(2),
        amountMvr: 1500,
        commissionRate: 10,
        merchantCount: 2,
        recordedById: adminId,
      },
    });

    const overview = await getPortalOverview(affiliateId);
    const { months, merchantsBrought, earningsMvr } = overview.trends;

    expect(months).toHaveLength(TREND_MONTHS);
    expect(merchantsBrought).toHaveLength(TREND_MONTHS);
    expect(earningsMvr).toHaveLength(TREND_MONTHS);

    // Cumulative: 0 until the two land, then 2, then 3 in the current month.
    expect(merchantsBrought[months.indexOf(periodAgo(4))]).toBe(0);
    expect(merchantsBrought[months.indexOf(periodAgo(3))]).toBe(2);
    expect(merchantsBrought[months.indexOf(periodAgo(1))]).toBe(2);
    expect(merchantsBrought[merchantsBrought.length - 1]).toBe(3);
    // Never decreases — an affiliate's book of business only grows.
    for (let i = 1; i < merchantsBrought.length; i++) {
      expect(merchantsBrought[i]).toBeGreaterThanOrEqual(merchantsBrought[i - 1]);
    }

    // Earnings: the recorded month is exact, unrecorded past months are zero,
    // and the current month mirrors the live projection.
    expect(earningsMvr[months.indexOf(periodAgo(2))]).toBe(1500);
    expect(earningsMvr[months.indexOf(periodAgo(3))]).toBe(0);
    expect(earningsMvr[earningsMvr.length - 1]).toBe(
      overview.stats.projectedThisMonthMvr
    );

    expect(overview.trends.newMerchantsThisMonth).toBe(1);
  });

  it("gives a brand-new affiliate flat, zeroed series rather than gaps", async () => {
    const fresh = await db.affiliate.create({
      data: {
        name: `Fresh ${suffix}`,
        code: generateAffiliateCode(),
        commissionRate: 10,
        active: true,
        applicationStatus: "APPROVED",
      },
    });

    const { trends } = await getPortalOverview(fresh.id);
    expect(trends.merchantsBrought).toEqual(Array(TREND_MONTHS).fill(0));
    expect(trends.earningsMvr).toEqual(Array(TREND_MONTHS).fill(0));
    expect(trends.newMerchantsThisMonth).toBe(0);
    expect(trends.earningsDeltaMvr).toBe(0);
  });
});
