import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin, ownerScope } from "@/lib/authz";
import { merchantMineWhere } from "@/services/merchant-access";

export type OwnerBreakdownRow = {
  ownerId: string;
  ownerName: string;
  prospect: number;
  active: number;
  churned: number;
  total: number;
  onboarded: number; // Active + loyalty live
  mrrMvr: number; // recurring revenue from this owner's billable merchants
  series: number[]; // new merchants per week, oldest → current (length WEEKS)
};

export type OwnerBreakdownTotals = {
  prospect: number;
  active: number;
  churned: number;
  total: number;
  onboarded: number;
  mrrMvr: number;
};

export type OwnerBreakdown = {
  currency: "MVR";
  rows: OwnerBreakdownRow[];
  totals: OwnerBreakdownTotals;
};

// Per-owner merchant counts by status, plus onboarded count and MRR. Team-wide:
// every user sees every owner's row (matches the hybrid "everyone sees all
// merchants" model). MRR reuses the subscription price-map logic from billing.
export async function getOwnerBreakdown(): Promise<OwnerBreakdown> {
  const [merchants, plans] = await Promise.all([
    db.merchant.findMany({
      select: {
        status: true,
        loyaltyLive: true,
        subscriptionPlan: true,
        branches: true,
        createdAt: true,
        owner: { select: { id: true, name: true } },
      },
    }),
    db.optionItem.findMany({
      where: { setKey: "SUBSCRIPTION_PLAN" },
      select: { label: true, priceMvr: true, perLocation: true },
    }),
  ]);

  const priceByPlan = new Map(plans.map((p) => [p.label, p]));
  const byOwner = new Map<string, OwnerBreakdownRow>();
  const now = Date.now();

  for (const m of merchants) {
    const row =
      byOwner.get(m.owner.id) ??
      ({
        ownerId: m.owner.id,
        ownerName: m.owner.name ?? "Unassigned",
        prospect: 0,
        active: 0,
        churned: 0,
        total: 0,
        onboarded: 0,
        mrrMvr: 0,
        series: new Array<number>(WEEKS).fill(0),
      } satisfies OwnerBreakdownRow);

    row.total += 1;
    if (m.status === "PROSPECT") row.prospect += 1;
    else if (m.status === "ACTIVE") row.active += 1;
    else if (m.status === "CHURNED") row.churned += 1;

    // New-merchants-per-week sparkline (last WEEKS weeks by createdAt).
    const idx = WEEKS - 1 - Math.floor((now - m.createdAt.getTime()) / WEEK_MS);
    if (idx >= 0 && idx < WEEKS) row.series[idx] += 1;

    const billable = m.status === "ACTIVE" && m.loyaltyLive;
    if (billable) {
      row.onboarded += 1;
      const price = m.subscriptionPlan ? priceByPlan.get(m.subscriptionPlan) : undefined;
      if (price && price.priceMvr != null) {
        row.mrrMvr += price.perLocation
          ? price.priceMvr * Math.max(1, m.branches ?? 1)
          : price.priceMvr;
      }
    }

    byOwner.set(m.owner.id, row);
  }

  const rows = [...byOwner.values()].sort(
    (a, b) => b.total - a.total || a.ownerName.localeCompare(b.ownerName)
  );

  const totals = rows.reduce(
    (acc, r) => ({
      prospect: acc.prospect + r.prospect,
      active: acc.active + r.active,
      churned: acc.churned + r.churned,
      total: acc.total + r.total,
      onboarded: acc.onboarded + r.onboarded,
      mrrMvr: acc.mrrMvr + r.mrrMvr,
    }),
    { prospect: 0, active: 0, churned: 0, total: 0, onboarded: 0, mrrMvr: 0 }
  );

  return { currency: "MVR", rows, totals };
}

// Real week-over-week trends for the dashboard KPI cards: how many records of
// each type were created per week over the last 8 weeks, plus this-week vs
// last-week. No snapshots are stored, so trends are derived from createdAt.

const WEEKS = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type Trend = {
  series: number[]; // length WEEKS, oldest → current week
  thisWeek: number;
  prevWeek: number;
};

function bucketize<T extends { createdAt: Date }>(items: T[], weight?: (i: T) => number): Trend {
  const now = Date.now();
  const series = new Array<number>(WEEKS).fill(0);
  for (const it of items) {
    const age = now - it.createdAt.getTime();
    const idx = WEEKS - 1 - Math.floor(age / WEEK_MS);
    if (idx >= 0 && idx < WEEKS) series[idx] += weight ? weight(it) : 1;
  }
  return { series, thisWeek: series[WEEKS - 1], prevWeek: series[WEEKS - 2] };
}

export type DashboardTrends = {
  merchants: Trend;
  deals: Trend;
  leads: Trend;
  pipelineMvr: Trend; // MVR value of deals created per week
};

export async function getDashboardTrends(ctx: SessionUser): Promise<DashboardTrends> {
  const admin = isAdmin(ctx);
  const cutoff = new Date(Date.now() - WEEKS * WEEK_MS);
  const dealScope = admin ? {} : { ownerId: ctx.id };

  const [merchants, deals, leads] = await Promise.all([
    db.merchant.findMany({
      where: { ...(admin ? {} : merchantMineWhere(ctx)), createdAt: { gte: cutoff } },
      select: { createdAt: true },
    }),
    db.deal.findMany({
      where: { ...dealScope, createdAt: { gte: cutoff } },
      select: { createdAt: true, value: true, currency: true },
    }),
    db.lead.findMany({
      where: { ...ownerScope(ctx), createdAt: { gte: cutoff } },
      select: { createdAt: true },
    }),
  ]);

  return {
    merchants: bucketize(merchants),
    deals: bucketize(deals),
    leads: bucketize(leads),
    pipelineMvr: bucketize(
      deals.filter((d) => d.currency === "MVR"),
      (d) => Number(d.value)
    ),
  };
}
