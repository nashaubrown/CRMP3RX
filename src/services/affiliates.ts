import { db } from "@/lib/db";
import { isAdmin, type SessionUser } from "@/lib/authz";
import type { AffiliateInput } from "@/lib/validators/affiliate";

// Referral partners. Reads (for the merchant-form dropdown) are open to any
// signed-in user; all mutations are admin-only, mirroring option sets.

export class AffiliateError extends Error {}

function assertAdmin(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new AffiliateError("Only admins can manage affiliates.");
}

export type ManagedAffiliate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  commissionRate: number;
  active: boolean;
  merchantCount: number;
};

// Full list (including inactive) for the admin manager UI.
export async function listAffiliates(ctx: SessionUser): Promise<ManagedAffiliate[]> {
  assertAdmin(ctx);
  const rows = await db.affiliate.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { merchants: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    commissionRate: a.commissionRate,
    active: a.active,
    merchantCount: a._count.merchants,
  }));
}

// Active affiliates for the merchant-form dropdown. `includeId` keeps a
// currently-selected affiliate visible even if it was later deactivated, so
// editing a merchant never silently drops its referrer.
export async function listAffiliateOptions(
  includeId?: string | null
): Promise<{ id: string; name: string }[]> {
  const rows = await db.affiliate.findMany({
    where: includeId ? { OR: [{ active: true }, { id: includeId }] } : { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows;
}

export async function createAffiliate(ctx: SessionUser, input: AffiliateInput) {
  assertAdmin(ctx);
  return db.affiliate.create({
    data: {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      commissionRate: input.commissionRate,
    },
  });
}

export async function updateAffiliate(ctx: SessionUser, id: string, input: AffiliateInput) {
  assertAdmin(ctx);
  const existing = await db.affiliate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AffiliateError("Affiliate not found.");
  return db.affiliate.update({
    where: { id },
    data: {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      commissionRate: input.commissionRate,
    },
  });
}

export async function setAffiliateActive(ctx: SessionUser, id: string, active: boolean) {
  assertAdmin(ctx);
  await db.affiliate.update({ where: { id }, data: { active } });
}

// ----- Commission report -----

export type AffiliateReportRow = {
  affiliateId: string;
  name: string;
  commissionRate: number;
  merchantsBrought: number;
  onboarded: number; // referred merchants that are billable (Active + loyalty live)
  monthlyMrrMvr: number; // combined MRR of the referred billable merchants
  monthlyCommissionMvr: number; // rate% of that MRR, per month
  rangeCommissionMvr: number; // monthly commission × months in the selected range
};

export type AffiliateReport = {
  currency: "MVR";
  months: number;
  rows: AffiliateReportRow[];
  totals: {
    merchantsBrought: number;
    onboarded: number;
    monthlyCommissionMvr: number;
    rangeCommissionMvr: number;
  };
};

// Inclusive whole-month span between two YYYY-MM strings (min 1). Commission is
// recurring monthly, so the range total = monthly commission × this count.
export function monthsInRange(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return 1;
  const diff = (ty * 12 + (tm - 1)) - (fy * 12 + (fm - 1)) + 1;
  return Math.max(1, diff);
}

// Per-affiliate commission owed. Commission is a recurring % of each referred
// merchant's current MRR; the range total multiplies the monthly figure by the
// number of months selected. This is an estimate based on *current* status and
// pricing (we don't store historical MRR or activation dates).
export async function getAffiliateReport(months: number): Promise<AffiliateReport> {
  const span = Math.max(1, Math.round(months));

  const [affiliates, plans] = await Promise.all([
    db.affiliate.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        commissionRate: true,
        merchants: {
          select: { status: true, loyaltyLive: true, subscriptionPlan: true, branches: true },
        },
      },
    }),
    db.optionItem.findMany({
      where: { setKey: "SUBSCRIPTION_PLAN" },
      select: { label: true, priceMvr: true, perLocation: true },
    }),
  ]);

  const priceByPlan = new Map(plans.map((p) => [p.label, p]));

  const rows: AffiliateReportRow[] = affiliates.map((a) => {
    let onboarded = 0;
    let monthlyMrr = 0;
    for (const m of a.merchants) {
      const billable = m.status === "ACTIVE" && m.loyaltyLive;
      if (!billable) continue;
      const price = m.subscriptionPlan ? priceByPlan.get(m.subscriptionPlan) : undefined;
      if (!price || price.priceMvr == null) continue;
      onboarded += 1;
      monthlyMrr += price.perLocation
        ? price.priceMvr * Math.max(1, m.branches ?? 1)
        : price.priceMvr;
    }
    const monthlyCommission = Math.round((monthlyMrr * a.commissionRate) / 100);
    return {
      affiliateId: a.id,
      name: a.name,
      commissionRate: a.commissionRate,
      merchantsBrought: a.merchants.length,
      onboarded,
      monthlyMrrMvr: monthlyMrr,
      monthlyCommissionMvr: monthlyCommission,
      rangeCommissionMvr: monthlyCommission * span,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      merchantsBrought: acc.merchantsBrought + r.merchantsBrought,
      onboarded: acc.onboarded + r.onboarded,
      monthlyCommissionMvr: acc.monthlyCommissionMvr + r.monthlyCommissionMvr,
      rangeCommissionMvr: acc.rangeCommissionMvr + r.rangeCommissionMvr,
    }),
    { merchantsBrought: 0, onboarded: 0, monthlyCommissionMvr: 0, rangeCommissionMvr: 0 }
  );

  // Highest earners first.
  rows.sort((a, b) => b.rangeCommissionMvr - a.rangeCommissionMvr || a.name.localeCompare(b.name));

  return { currency: "MVR", months: span, rows, totals };
}
