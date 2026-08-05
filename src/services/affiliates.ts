import { db } from "@/lib/db";
import { isAdmin, type SessionUser } from "@/lib/authz";
import { generateAffiliateCode } from "@/lib/affiliate-code";
import type { AffiliateInput } from "@/lib/validators/affiliate";
import {
  commissionPaidEmail,
  commissionRecordedEmail,
  sendAffiliateEmail,
} from "@/emails/affiliate-portal";

// Referral partners. Reads (for the merchant-form dropdown) are open to any
// signed-in user. Managing them is open to the whole sales team: reps sign up
// the referral partners they work with, so routing that through an admin just
// added a queue.

export class AffiliateError extends Error {}

// Managing the partner records themselves — open to the whole team.
function assertCanManage(ctx: SessionUser) {
  if (!ctx?.id) throw new AffiliateError("You must be signed in to manage affiliates.");
}

// The payout ledger stays admin-only: recording a period and marking a
// commission PAID is a money decision, not day-to-day sales work.
function assertAdmin(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new AffiliateError("Only admins can manage commission payouts.");
}

export type ManagedAffiliate = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  commissionRate: number;
  active: boolean;
  merchantCount: number;
  // Portal / application fields
  payoutSchedule: "MONTHLY" | "QUARTERLY" | "YEARLY";
  applicationStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  idCardNumber: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
  tcVersion: string | null;
  tcAcceptedAt: Date | null;
  lastPortalLoginAt: Date | null;
  portalLeadCount: number;
};

// Full list (including inactive) for the admin manager UI. Draft and pending
// self-registrations are excluded — they live in the Applications queue until
// approved.
export async function listAffiliates(ctx: SessionUser): Promise<ManagedAffiliate[]> {
  assertCanManage(ctx);
  const rows = await db.affiliate.findMany({
    where: { applicationStatus: "APPROVED" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { merchants: true, referredLeads: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    email: a.email,
    phone: a.phone,
    commissionRate: a.commissionRate,
    active: a.active,
    merchantCount: a._count.merchants,
    payoutSchedule: a.payoutSchedule,
    applicationStatus: a.applicationStatus,
    idCardNumber: a.idCardNumber,
    bankName: a.bankName,
    bankAccountName: a.bankAccountName,
    bankAccountLast4: a.bankAccountLast4,
    tcVersion: a.tcVersion,
    tcAcceptedAt: a.tcAcceptedAt,
    lastPortalLoginAt: a.lastPortalLoginAt,
    portalLeadCount: a._count.referredLeads,
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

// How many times to retry on a code collision before giving up. At 729M
// possible codes a single retry is already unreachable in practice; this is
// only here so a pathological case fails loudly instead of looping forever.
const CODE_ATTEMPTS = 5;

export async function createAffiliate(ctx: SessionUser, input: AffiliateInput) {
  assertCanManage(ctx);
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    try {
      return await db.affiliate.create({
        data: {
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          commissionRate: input.commissionRate,
          code: generateAffiliateCode(),
          // Staff-created affiliates skip the application flow entirely.
          applicationStatus: "APPROVED",
          emailVerifiedAt: new Date(),
        },
      });
    } catch (e) {
      // P2002 = unique constraint. Only the code can collide here, so retry
      // with a fresh one; anything else is a real error.
      if (isUniqueViolation(e) && attempt < CODE_ATTEMPTS - 1) continue;
      throw e;
    }
  }
  throw new AffiliateError("Could not allocate a referral code. Please try again.");
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// Note: `code` is deliberately absent from the update payload. It is issued
// once at creation and never changes — it gets printed, shared and quoted on
// payouts, so a new code would orphan that history.
export async function updateAffiliate(ctx: SessionUser, id: string, input: AffiliateInput) {
  assertCanManage(ctx);
  const existing = await db.affiliate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AffiliateError("Affiliate not found.");
  return db.affiliate.update({
    where: { id },
    data: {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      commissionRate: input.commissionRate,
      ...(input.payoutSchedule ? { payoutSchedule: input.payoutSchedule } : {}),
    },
  });
}

export async function setAffiliateActive(ctx: SessionUser, id: string, active: boolean) {
  assertCanManage(ctx);
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

// Current monthly commission figures for every affiliate, derived from live
// merchant status and plan pricing. Shared by the projected report and the
// ledger snapshot.
export type MonthlyFigure = {
  affiliateId: string;
  name: string;
  commissionRate: number;
  merchantsBrought: number;
  onboarded: number;
  monthlyMrrMvr: number;
  monthlyCommissionMvr: number;
};

// Pass an affiliateId to compute a single affiliate's figure (the portal's
// projected-month view); omit it for the org-wide report and ledger snapshot.
export async function computeMonthlyByAffiliate(affiliateId?: string): Promise<MonthlyFigure[]> {
  const [affiliates, plans] = await Promise.all([
    db.affiliate.findMany({
      where: affiliateId ? { id: affiliateId } : undefined,
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

  return affiliates.map((a) => {
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
    return {
      affiliateId: a.id,
      name: a.name,
      commissionRate: a.commissionRate,
      merchantsBrought: a.merchants.length,
      onboarded,
      monthlyMrrMvr: monthlyMrr,
      monthlyCommissionMvr: Math.round((monthlyMrr * a.commissionRate) / 100),
    };
  });
}

// Per-affiliate commission owed. Commission is a recurring % of each referred
// merchant's current MRR; the range total multiplies the monthly figure by the
// number of months selected. This is an estimate based on *current* status and
// pricing (we don't store historical MRR or activation dates).
export async function getAffiliateReport(months: number): Promise<AffiliateReport> {
  const span = Math.max(1, Math.round(months));
  const figures = await computeMonthlyByAffiliate();

  const rows: AffiliateReportRow[] = figures.map((f) => ({
    affiliateId: f.affiliateId,
    name: f.name,
    commissionRate: f.commissionRate,
    merchantsBrought: f.merchantsBrought,
    onboarded: f.onboarded,
    monthlyMrrMvr: f.monthlyMrrMvr,
    monthlyCommissionMvr: f.monthlyCommissionMvr,
    rangeCommissionMvr: f.monthlyCommissionMvr * span,
  }));

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

// ----- Payout ledger -----

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CommissionEntry = {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliatePayoutSchedule: "MONTHLY" | "QUARTERLY" | "YEARLY";
  period: string;
  amountMvr: number;
  commissionRate: number;
  merchantCount: number;
  status: "PENDING" | "PAID";
  paidAt: Date | null;
  paidByName: string | null;
};

export type CommissionLedger = {
  currency: "MVR";
  period: string;
  entries: CommissionEntry[];
  pendingMvr: number;
  paidMvr: number;
  totalMvr: number;
};

// Freeze the current monthly commission for every earning affiliate into the
// ledger for `period`. Re-recording refreshes still-pending amounts but never
// touches entries already marked paid (payout history stays intact).
export async function recordCommissionsForPeriod(
  ctx: SessionUser,
  period: string
): Promise<{ recorded: number; updated: number; skippedPaid: number }> {
  assertAdmin(ctx);
  if (!PERIOD_RE.test(period)) throw new AffiliateError("Pick a valid month.");

  const figures = await computeMonthlyByAffiliate();
  const earners = figures.filter((f) => f.monthlyCommissionMvr > 0);

  const existing = await db.affiliateCommission.findMany({
    where: { period },
    select: { id: true, affiliateId: true, status: true },
  });
  const byAffiliate = new Map(existing.map((e) => [e.affiliateId, e]));

  let recorded = 0;
  let updated = 0;
  let skippedPaid = 0;
  const newlyRecorded: { affiliateId: string; amountMvr: number }[] = [];

  for (const f of earners) {
    const prior = byAffiliate.get(f.affiliateId);
    if (!prior) {
      await db.affiliateCommission.create({
        data: {
          affiliateId: f.affiliateId,
          period,
          amountMvr: f.monthlyCommissionMvr,
          commissionRate: f.commissionRate,
          merchantCount: f.onboarded,
          recordedById: ctx.id,
        },
      });
      recorded += 1;
      newlyRecorded.push({ affiliateId: f.affiliateId, amountMvr: f.monthlyCommissionMvr });
    } else if (prior.status === "PAID") {
      skippedPaid += 1;
    } else {
      await db.affiliateCommission.update({
        where: { id: prior.id },
        data: {
          amountMvr: f.monthlyCommissionMvr,
          commissionRate: f.commissionRate,
          merchantCount: f.onboarded,
          recordedById: ctx.id,
        },
      });
      updated += 1;
    }
  }

  // Portal notification: first recording of a period only — re-records are
  // corrections and shouldn't re-announce. Failures are swallowed inside the
  // email helper, so a flaky provider never breaks the recording.
  if (newlyRecorded.length > 0) {
    const recipients = await db.affiliate.findMany({
      where: {
        id: { in: newlyRecorded.map((n) => n.affiliateId) },
        emailNotifications: true,
        email: { not: null },
      },
      select: { id: true, email: true },
    });
    const emailById = new Map(recipients.map((r) => [r.id, r.email!]));
    await Promise.all(
      newlyRecorded
        .filter((n) => emailById.has(n.affiliateId))
        .map((n) => {
          const msg = commissionRecordedEmail({ period, amountMvr: n.amountMvr });
          return sendAffiliateEmail(emailById.get(n.affiliateId)!, msg.subject, msg.bodyHtml);
        })
    );
  }

  return { recorded, updated, skippedPaid };
}

export async function getCommissionLedger(period: string): Promise<CommissionLedger> {
  const safePeriod = PERIOD_RE.test(period) ? period : "";
  const rows = safePeriod
    ? await db.affiliateCommission.findMany({
        where: { period: safePeriod },
        orderBy: { amountMvr: "desc" },
        include: {
          affiliate: { select: { name: true, payoutSchedule: true } },
          paidBy: { select: { name: true } },
        },
      })
    : [];

  const entries: CommissionEntry[] = rows.map((r) => ({
    id: r.id,
    affiliateId: r.affiliateId,
    affiliateName: r.affiliate.name,
    affiliatePayoutSchedule: r.affiliate.payoutSchedule,
    period: r.period,
    amountMvr: r.amountMvr,
    commissionRate: r.commissionRate,
    merchantCount: r.merchantCount,
    status: r.status,
    paidAt: r.paidAt,
    paidByName: r.paidBy?.name ?? null,
  }));

  const pendingMvr = entries.filter((e) => e.status === "PENDING").reduce((s, e) => s + e.amountMvr, 0);
  const paidMvr = entries.filter((e) => e.status === "PAID").reduce((s, e) => s + e.amountMvr, 0);

  return {
    currency: "MVR",
    period: safePeriod,
    entries,
    pendingMvr,
    paidMvr,
    totalMvr: pendingMvr + paidMvr,
  };
}

export async function setCommissionStatus(
  ctx: SessionUser,
  id: string,
  status: "PENDING" | "PAID"
): Promise<void> {
  assertAdmin(ctx);
  const entry = await db.affiliateCommission.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      period: true,
      amountMvr: true,
      affiliate: { select: { email: true, emailNotifications: true } },
    },
  });
  if (!entry) throw new AffiliateError("Commission entry not found.");
  await db.affiliateCommission.update({
    where: { id },
    data:
      status === "PAID"
        ? { status: "PAID", paidAt: new Date(), paidById: ctx.id }
        : { status: "PENDING", paidAt: null, paidById: null },
  });

  // Portal notification on the PENDING -> PAID transition (opt-out honored).
  if (status === "PAID" && entry.status !== "PAID") {
    const { email, emailNotifications } = entry.affiliate;
    if (email && emailNotifications) {
      const msg = commissionPaidEmail({ period: entry.period, amountMvr: entry.amountMvr });
      await sendAffiliateEmail(email, msg.subject, msg.bodyHtml);
    }
  }
}

// Months that already have recorded ledger entries, most recent first.
export async function listRecordedPeriods(): Promise<string[]> {
  const rows = await db.affiliateCommission.findMany({
    distinct: ["period"],
    orderBy: { period: "desc" },
    select: { period: true },
  });
  return rows.map((r) => r.period);
}
