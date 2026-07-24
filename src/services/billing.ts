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
  // Derived headline figures.
  arrMvr: number; // annual run-rate = MRR × 12
  arpaMvr: number; // average revenue per billable merchant
  // Near-term upside: merchants on a priced plan that aren't billable yet
  // (Prospect, or Active but loyalty not live) — real pipeline, not a guess.
  pipelineMrr: number;
  pipelineCount: number;
  // Average configured plan price — a sensible "revenue per new merchant"
  // default for the projection when there's no billing history yet.
  avgPlanPriceMvr: number;
};

export async function getBilling(ctx: SessionUser): Promise<Billing> {
  const admin = isAdmin(ctx);

  const [merchants, plans] = await Promise.all([
    // Every merchant on a plan (scoped) — we split billable vs. pipeline below.
    db.merchant.findMany({
      where: {
        subscriptionPlan: { not: null },
        ...(admin ? {} : merchantMineWhere(ctx)),
      },
      select: { subscriptionPlan: true, branches: true, status: true, loyaltyLive: true },
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
  let pipelineMrr = 0;
  let pipelineCount = 0;

  for (const m of merchants) {
    const price = priceByPlan.get(m.subscriptionPlan!);
    if (!price || price.priceMvr == null) continue; // unpriced plan → skip

    // Per-location plans multiply by branch count (missing count = 1 location).
    const amount = price.perLocation
      ? price.priceMvr * Math.max(1, m.branches ?? 1)
      : price.priceMvr;

    const billable = m.status === "ACTIVE" && m.loyaltyLive;
    if (billable) {
      total += amount;
      merchantCount += 1;
      const line =
        agg.get(m.subscriptionPlan!) ??
        ({
          plan: m.subscriptionPlan!,
          count: 0,
          unitPriceMvr: price.priceMvr,
          perLocation: price.perLocation,
          subtotalMvr: 0,
        } satisfies BillingLine);
      line.count += 1;
      line.subtotalMvr += amount;
      agg.set(m.subscriptionPlan!, line);
    } else if (m.status !== "CHURNED") {
      // Not yet live but not churned → would add to MRR once onboarded.
      pipelineMrr += amount;
      pipelineCount += 1;
    }
  }

  const lines = [...agg.values()].sort((a, b) => b.subtotalMvr - a.subtotalMvr);
  const pricedPlans = plans.filter((p) => p.priceMvr != null);
  const avgPlanPriceMvr =
    pricedPlans.length > 0
      ? Math.round(pricedPlans.reduce((s, p) => s + (p.priceMvr ?? 0), 0) / pricedPlans.length)
      : 0;

  return {
    currency: "MVR",
    totalMrr: total,
    merchantCount,
    lines,
    arrMvr: total * 12,
    arpaMvr: merchantCount > 0 ? Math.round(total / merchantCount) : 0,
    pipelineMrr,
    pipelineCount,
    avgPlanPriceMvr,
  };
}
