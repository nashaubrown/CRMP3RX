import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { generateAffiliateCode } from "@/lib/affiliate-code";
import { convertLead } from "@/services/leads";
import { captureLead } from "@/services/leads";
import { submitReferral } from "@/services/affiliate-portal";
import { computeMonthlyByAffiliate } from "@/services/affiliates";

// The full referral money path: a referral submitted in the portal (or via a
// ?ref= capture link) becomes a Lead, a rep converts it into a Merchant, and
// the affiliate earns commission on it. Attribution has to survive the
// conversion — commission is computed from Merchant.affiliateId, so a
// dropped link here silently unpays the affiliate.

const suffix = `conv-${Math.random().toString(36).slice(2, 8)}`;
let rep: SessionUser;
let affiliateId: string;
let planLabel: string;

beforeAll(async () => {
  const repUser = await db.user.create({
    data: { name: `Conv Rep ${suffix}`, email: `conv-rep-${suffix}@t.mv`, role: "SALES_REP" },
  });
  rep = { id: repUser.id, role: "SALES_REP", name: repUser.name };

  const affiliate = await db.affiliate.create({
    data: {
      name: `Conv Affiliate ${suffix}`,
      code: generateAffiliateCode(),
      email: `conv-aff-${suffix}@t.mv`,
      commissionRate: 10,
      active: true,
      applicationStatus: "APPROVED",
    },
  });
  affiliateId = affiliate.id;

  planLabel = `Conv Plan ${suffix}`;
  await db.optionItem.create({
    data: {
      setKey: "SUBSCRIPTION_PLAN",
      label: planLabel,
      priceMvr: 2000,
      perLocation: false,
    },
  });
});

describe("referral attribution survives lead conversion", () => {
  it("carries the affiliate from a portal referral through to commission", async () => {
    const affiliate = await db.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
    await submitReferral(affiliate, {
      businessName: `Referred Cafe ${suffix}`,
      contactPerson: "Ahmed Ali",
      email: `cafe-${suffix}@t.mv`,
      phone: "+9607771234",
      note: "Owner is expecting a call this week.",
    });

    const lead = await db.lead.findFirstOrThrow({
      where: { affiliateId, company: `Referred Cafe ${suffix}` },
    });
    expect(lead.source).toBe("REFERRAL");
    expect(lead.ownerId).toBeNull(); // unassigned: any rep can claim it

    const { merchant } = await convertLead(rep, lead.id);
    // The whole point: the merchant inherits the referral credit.
    expect(merchant.affiliateId).toBe(affiliateId);

    // And that credit turns into real money once the merchant is billable.
    await db.merchant.update({
      where: { id: merchant.id },
      data: { status: "ACTIVE", loyaltyLive: true, subscriptionPlan: planLabel },
    });
    const [figure] = await computeMonthlyByAffiliate(affiliateId);
    expect(figure.onboarded).toBe(1);
    expect(figure.monthlyCommissionMvr).toBe(200); // 10% of MVR 2,000
  });

  it("carries the affiliate from a ?ref= capture-form lead too", async () => {
    await captureLead(
      {
        name: "Fathmath Ibrahim",
        company: `Captured Shop ${suffix}`,
        email: `shop-${suffix}@t.mv`,
        phone: undefined,
        message: undefined,
        website: "",
      },
      affiliateId
    );

    const lead = await db.lead.findFirstOrThrow({
      where: { affiliateId, company: `Captured Shop ${suffix}` },
    });
    const { merchant } = await convertLead(rep, lead.id);
    expect(merchant.affiliateId).toBe(affiliateId);
  });

  it("leaves an unattributed lead unattributed", async () => {
    await captureLead({
      name: "Walk In",
      company: `Direct Signup ${suffix}`,
      email: `direct-${suffix}@t.mv`,
      phone: undefined,
      message: undefined,
      website: "",
    });

    const lead = await db.lead.findFirstOrThrow({
      where: { company: `Direct Signup ${suffix}` },
    });
    expect(lead.affiliateId).toBeNull();

    const { merchant } = await convertLead(rep, lead.id);
    expect(merchant.affiliateId).toBeNull();
  });
});
