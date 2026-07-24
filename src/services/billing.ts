import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { merchantMineWhere } from "@/services/merchant-access";

// Monthly recurring revenue from subscription plans. Billable = Active
// merchants whose loyalty program is live and who are on a priced plan.
// Enterprise-style plans are charged per branch/location.

export type BillingLine = {
  plan: string;
  count: number; // billable merchants on this plan
  unitPriceMvr: number;
  perLocation: boolean;
  subtotalMvr: number;
};

export type Billing = {
  currency: "MVR";
  totalMrr: number;
  merchantCount: number;
  lines: BillingLine[];
};

export async function getBilling(ctx: SessionUser): Promise<Billing> {
  const admin = isAdmin(ctx);

  const [merchants, plans] = await Promise.all([
    db.merchant.findMany({
      where: {
        status: "ACTIVE",
        loyaltyLive: true,
        subscriptionPlan: { not: null },
        ...(admin ? {} : merchantMineWhere(ctx)),
      },
      select: { subscriptionPlan: true, branches: true },
    }),
    db.optionItem.findMany({
      where: { setKey: "SUBSCRIPTION_PLAN" },
      select: { label: true, priceMvr: true, perLocation: true },
    }),
  ]);

  const priceByPlan = new Map(plans.map((p) => [p.label, p]));
  const agg = new Map<string, BillingLine>();
  let total = 0;
  let merchantCount = 0;

  for (const m of merchants) {
    const plan = m.subscriptionPlan!;
    const price = priceByPlan.get(plan);
    if (!price || price.priceMvr == null) continue; // unpriced plan → skip

    // Per-location plans multiply by branch count (missing count = 1 location).
    const amount = price.perLocation
      ? price.priceMvr * Math.max(1, m.branches ?? 1)
      : price.priceMvr;

    total += amount;
    merchantCount += 1;

    const line =
      agg.get(plan) ??
      ({
        plan,
        count: 0,
        unitPriceMvr: price.priceMvr,
        perLocation: price.perLocation,
        subtotalMvr: 0,
      } satisfies BillingLine);
    line.count += 1;
    line.subtotalMvr += amount;
    agg.set(plan, line);
  }

  const lines = [...agg.values()].sort((a, b) => b.subtotalMvr - a.subtotalMvr);
  return { currency: "MVR", totalMrr: total, merchantCount, lines };
}
