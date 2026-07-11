import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin, ownerScope } from "@/lib/authz";
import { merchantMineWhere } from "@/services/merchant-access";

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
