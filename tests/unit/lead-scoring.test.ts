import { describe, expect, it } from "vitest";

import { computeLeadScore, scoreBand } from "@/services/lead-scoring";

describe("computeLeadScore", () => {
  it("scores a bare cold lead low", () => {
    expect(computeLeadScore({ source: "COLD_OUTREACH" })).toBe(5);
  });

  it("adds points for contactability and intent", () => {
    const score = computeLeadScore({
      source: "WEBSITE",
      phone: "+9607771234",
      email: "a@b.mv",
      company: "Test Co",
      message: "We want a loyalty program for our two outlets",
    });
    // 15 + 15 + 10 + 10 + 10
    expect(score).toBe(60);
  });

  it("boosts referrals over cold outreach", () => {
    const referral = computeLeadScore({ source: "REFERRAL" });
    const cold = computeLeadScore({ source: "COLD_OUTREACH" });
    expect(referral).toBeGreaterThan(cold);
  });

  it("uses merchant transaction volume tiers", () => {
    const base = { source: "WEBSITE" as const };
    expect(computeLeadScore({ ...base, merchantMonthlyTxnVolume: 10000 })).toBe(45);
    expect(computeLeadScore({ ...base, merchantMonthlyTxnVolume: 2000 })).toBe(35);
    expect(computeLeadScore({ ...base, merchantMonthlyTxnVolume: 100 })).toBe(25);
  });

  it("ignores short messages", () => {
    expect(computeLeadScore({ source: "WEBSITE", message: "hi" })).toBe(15);
  });

  it("clamps to 100", () => {
    const score = computeLeadScore({
      source: "REFERRAL",
      phone: "+9607771234",
      email: "a@b.mv",
      company: "Test Co",
      message: "A long and detailed message about our needs",
      merchantMonthlyTxnVolume: 99999,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("scoreBand", () => {
  it("bands correctly", () => {
    expect(scoreBand(75)).toBe("HOT");
    expect(scoreBand(70)).toBe("HOT");
    expect(scoreBand(69)).toBe("WARM");
    expect(scoreBand(40)).toBe("WARM");
    expect(scoreBand(39)).toBe("COLD");
    expect(scoreBand(0)).toBe("COLD");
  });
});
