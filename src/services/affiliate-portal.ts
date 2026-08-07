import { createHash, randomBytes, randomInt } from "node:crypto";

import type { Affiliate, AffiliateTokenPurpose, PayoutSchedule } from "@prisma/client";

import { db } from "@/lib/db";
import { isAdmin, type SessionUser } from "@/lib/authz";
import { generateAffiliateCode, isValidAffiliateCode, normalizeAffiliateCode } from "@/lib/affiliate-code";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  deleteAffiliateFiles,
  ID_DOCUMENT_CONTENT_TYPES,
  ID_DOCUMENT_MAX_BYTES,
  saveAffiliateFile,
  SIGNATURE_MAX_BYTES,
  sniffContentType,
} from "@/lib/affiliate-files";
import type {
  ApproveApplicationInput,
  BankApplyChangeInput,
  PortalMerchantsParams,
  PortalReferralInput,
  RegisterStartInput,
  SubmitApplicationInput,
  TermsSettingInput,
} from "@/lib/validators/affiliate-portal";
import { computeLeadScore } from "@/services/lead-scoring";
import { computeMonthlyByAffiliate } from "@/services/affiliates";
import { audit } from "@/services/audit";
import {
  alreadyRegisteredEmail,
  applicationApprovedEmail,
  applicationReceivedEmail,
  applicationRejectedEmail,
  bankChangeConfirmEmail,
  bankChangedAdminEmail,
  bankChangedAffiliateEmail,
  magicLinkEmail,
  newApplicationAdminEmail,
  notifyAdmins,
  portalUrl,
  registrationCodeEmail,
  sendAffiliateEmail,
  stillUnderReviewEmail,
} from "@/emails/affiliate-portal";

// The affiliate portal's backend: self-registration with KYC and a signed
// T&C, magic-link auth, session management, portal data (always scoped to the
// session's affiliate), protected bank-detail changes, and the admin review
// queue. The portal app itself is stateless — everything here is the source
// of truth.

export class AffiliatePortalError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

function assertAdmin(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new AffiliatePortalError("Admins only.", 403);
}

// ---- Tokens (hashes only; pattern: ApiKey.hashedKey) ----

const TOKEN_TTL_MS: Record<AffiliateTokenPurpose, number> = {
  LOGIN: 15 * 60 * 1000,
  REGISTER_EMAIL: 15 * 60 * 1000,
  DRAFT: 7 * 24 * 60 * 60 * 1000, // resumable-application window
  BANK_CHANGE: 15 * 60 * 1000,
  APPLICATION_STATUS: 90 * 24 * 60 * 60 * 1000,
};

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day sliding
const SESSION_SLIDE_MIN_INTERVAL_MS = 60 * 60 * 1000; // slide at most hourly

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function issueToken(affiliateId: string, purpose: AffiliateTokenPurpose): Promise<string> {
  // 6-digit codes for the email-verification step (typed by hand on a phone);
  // long CSPRNG tokens for everything that travels in a link.
  const raw =
    purpose === "REGISTER_EMAIL"
      ? randomInt(0, 1_000_000).toString().padStart(6, "0")
      : randomBytes(32).toString("base64url");

  // One live token per purpose: re-requesting invalidates the previous one.
  await db.affiliateLoginToken.deleteMany({
    where: { affiliateId, purpose, consumedAt: null },
  });
  await db.affiliateLoginToken.create({
    data: {
      affiliateId,
      purpose,
      hashedToken: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
    },
  });
  return raw;
}

// Look up a live token. `consume` marks it used (single-use purposes); DRAFT
// and APPLICATION_STATUS tokens stay valid until expiry so a link/draft can
// be revisited.
async function findToken(raw: string, purpose: AffiliateTokenPurpose, consume: boolean) {
  const row = await db.affiliateLoginToken.findUnique({
    where: { hashedToken: hashToken(raw) },
    include: { affiliate: true },
  });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) {
    return null;
  }
  if (consume) {
    await db.affiliateLoginToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
  }
  return row;
}

// ---- Registration ----

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findAffiliateByEmail(email: string) {
  return db.affiliate.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
  });
}

const REAPPLY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// Step 1 of registration. Always resolves { ok: true } no matter what — which
// email gets sent (verification code / "sign in instead" / "under review")
// is invisible to the caller, so the endpoint can't be used to test whether
// an address has an account.
export async function startRegistration(input: RegisterStartInput): Promise<void> {
  const email = normalizeEmail(input.email);
  const existing = await findAffiliateByEmail(email);

  if (existing) {
    if (existing.applicationStatus === "APPROVED") {
      const msg = alreadyRegisteredEmail();
      await sendAffiliateEmail(email, msg.subject, msg.bodyHtml);
      return;
    }
    if (existing.applicationStatus === "PENDING_REVIEW" && existing.appliedAt) {
      const msg = stillUnderReviewEmail();
      await sendAffiliateEmail(email, msg.subject, msg.bodyHtml);
      return;
    }
    if (existing.applicationStatus === "PENDING_REVIEW" && !existing.appliedAt) {
      // Abandoned draft: resume — refresh the basics and send a new code.
      await db.affiliate.update({
        where: { id: existing.id },
        data: { name: input.fullName, phone: input.phone },
      });
      const code = await issueToken(existing.id, "REGISTER_EMAIL");
      const msg = registrationCodeEmail(code);
      await sendAffiliateEmail(email, msg.subject, msg.bodyHtml);
      return;
    }
    if (existing.applicationStatus === "REJECTED") {
      const reviewedAt = existing.reviewedAt?.getTime() ?? 0;
      if (Date.now() - reviewedAt < REAPPLY_COOLDOWN_MS) {
        await sendAffiliateEmail(
          email,
          "About your Perx affiliate application",
          `<p>Thanks for your continued interest in the Perx affiliate program. Applications can be re-submitted 30 days after a review — please try again a little later.</p>`
        );
        return;
      }
      // Past the cooldown: fall through and open a fresh draft. The old
      // rejected row stays for the reviewing admin's context.
    }
  }

  const draft = await createDraftAffiliate(input, email);
  const code = await issueToken(draft.id, "REGISTER_EMAIL");
  const msg = registrationCodeEmail(code);
  await sendAffiliateEmail(email, msg.subject, msg.bodyHtml);
}

async function createDraftAffiliate(input: RegisterStartInput, email: string) {
  // `code` is required-unique, so it's allocated at draft creation — but it is
  // never shown to the applicant, and resolveReferralCode only honors APPROVED
  // affiliates, so an unapproved code is inert.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.affiliate.create({
        data: {
          name: input.fullName,
          email,
          phone: input.phone,
          code: generateAffiliateCode(),
          commissionRate: 0,
          active: false,
          applicationStatus: "PENDING_REVIEW",
        },
      });
    } catch (e) {
      const isUnique =
        typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
      if (isUnique && attempt < 4) continue;
      throw e;
    }
  }
  throw new AffiliatePortalError("Could not start your application. Please try again.");
}

export type DraftResume = {
  draftToken: string;
  fullName: string;
  email: string;
  phone: string | null;
};

// Step 1b: the applicant types the 6-digit code. Proves the email before any
// sensitive data is entered, and mints the draft token that authorizes the
// final submit (valid 7 days — the resume window).
export async function verifyRegistrationEmail(
  email: string,
  code: string
): Promise<DraftResume | null> {
  const draft = await findAffiliateByEmail(email);
  if (!draft || draft.applicationStatus !== "PENDING_REVIEW" || draft.appliedAt) return null;

  const token = await findToken(code, "REGISTER_EMAIL", true);
  if (!token || token.affiliateId !== draft.id) return null;

  await db.affiliate.update({
    where: { id: draft.id },
    data: { emailVerifiedAt: new Date() },
  });
  const draftToken = await issueToken(draft.id, "DRAFT");
  return { draftToken, fullName: draft.name, email: draft.email!, phone: draft.phone };
}

export type SubmitApplicationFiles = {
  idDocument: { bytes: Uint8Array; declaredType: string };
  signature: { bytes: Uint8Array };
};

export type SubmitMeta = { ip: string | null; userAgent: string | null };

// Final submit: identity + bank + signed terms, all in one multipart request.
export async function submitApplication(
  input: SubmitApplicationInput,
  files: SubmitApplicationFiles,
  meta: SubmitMeta
): Promise<void> {
  const token = await findToken(input.draftToken, "DRAFT", false);
  const affiliate = token?.affiliate;
  if (
    !affiliate ||
    affiliate.applicationStatus !== "PENDING_REVIEW" ||
    affiliate.appliedAt ||
    !affiliate.emailVerifiedAt
  ) {
    throw new AffiliatePortalError("Your session has expired — please start again.", 401);
  }

  // Applicants sign the terms version they were shown. If an admin published
  // new terms mid-application, force a reload rather than record a stale sign.
  const terms = await getPublishedTerms();
  if (terms && terms.version !== input.tcVersion) {
    throw new AffiliatePortalError(
      "The Terms & Conditions were updated while you were applying. Please review and sign the new version.",
      409
    );
  }

  // Validate files by content, not by what the client claims they are.
  const idType = sniffContentType(files.idDocument.bytes);
  if (!idType || !(ID_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(idType)) {
    throw new AffiliatePortalError("The ID document must be a JPEG, PNG or PDF file.");
  }
  if (files.idDocument.bytes.byteLength > ID_DOCUMENT_MAX_BYTES) {
    throw new AffiliatePortalError("The ID document must be 10 MB or smaller.");
  }
  if (sniffContentType(files.signature.bytes) !== "image/png") {
    throw new AffiliatePortalError("The signature must be a PNG image.");
  }
  if (files.signature.bytes.byteLength > SIGNATURE_MAX_BYTES) {
    throw new AffiliatePortalError("The signature image is too large.");
  }

  const idDocumentKey = await saveAffiliateFile({
    affiliateId: affiliate.id,
    kind: "ID_DOCUMENT",
    contentType: idType,
    data: files.idDocument.bytes,
  });
  const signatureKey = await saveAffiliateFile({
    affiliateId: affiliate.id,
    kind: "SIGNATURE",
    contentType: "image/png",
    data: files.signature.bytes,
    tcVersion: input.tcVersion,
  });

  await db.affiliate.update({
    where: { id: affiliate.id },
    data: {
      idCardNumber: input.idCardNumber,
      idDocumentKey,
      bankName: input.bankName,
      bankAccountName: input.bankAccountName,
      bankAccountNoEnc: encryptSecret(input.bankAccountNumber),
      bankAccountLast4: input.bankAccountNumber.slice(-4),
      tcVersion: input.tcVersion,
      tcAcceptedAt: new Date(),
      tcAcceptedIp: meta.ip,
      tcAcceptedUa: meta.userAgent,
      signatureKey,
      appliedAt: new Date(),
    },
  });

  // The draft token is done; the status link takes over.
  await db.affiliateLoginToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });

  const statusToken = await issueToken(affiliate.id, "APPLICATION_STATUS");
  const received = applicationReceivedEmail(
    portalUrl(`/register/pending?token=${statusToken}`)
  );
  await sendAffiliateEmail(affiliate.email!, received.subject, received.bodyHtml);

  const adminMsg = newApplicationAdminEmail({ name: affiliate.name, email: affiliate.email! });
  await notifyAdmins(adminMsg.subject, adminMsg.bodyHtml);

  await audit({
    actorId: null,
    action: "affiliate.apply",
    entityType: "AFFILIATE",
    entityId: affiliate.id,
    diff: { name: affiliate.name },
  });
}

export type ApplicationStatusView = "UNDER_REVIEW" | "APPROVED" | "REJECTED";

// Status-check link from the confirmation email. Deliberately PII-free.
export async function getApplicationStatus(raw: string): Promise<ApplicationStatusView | null> {
  const token = await findToken(raw, "APPLICATION_STATUS", false);
  if (!token) return null;
  switch (token.affiliate.applicationStatus) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    default:
      return "UNDER_REVIEW";
  }
}

// ---- Auth & sessions ----

// Magic-link request. Approved affiliates get a link (even deactivated ones —
// they may be owed money and can still see history); pending applicants get
// "still under review"; unknown emails get nothing. Always resolves.
export async function requestLoginLink(email: string): Promise<void> {
  const affiliate = await findAffiliateByEmail(email);
  if (!affiliate) return;

  if (affiliate.applicationStatus === "APPROVED") {
    const raw = await issueToken(affiliate.id, "LOGIN");
    const msg = magicLinkEmail(portalUrl(`/auth/verify?token=${raw}`));
    await sendAffiliateEmail(normalizeEmail(email), msg.subject, msg.bodyHtml);
  } else if (affiliate.applicationStatus === "PENDING_REVIEW" && affiliate.appliedAt) {
    const msg = stillUnderReviewEmail();
    await sendAffiliateEmail(normalizeEmail(email), msg.subject, msg.bodyHtml);
  }
}

export type PortalSession = { sessionToken: string; affiliate: PortalProfile };

export async function verifyLoginToken(raw: string): Promise<PortalSession | null> {
  const token = await findToken(raw, "LOGIN", true);
  if (!token || token.affiliate.applicationStatus !== "APPROVED") return null;

  const sessionToken = randomBytes(32).toString("base64url");
  await db.affiliateSession.create({
    data: {
      affiliateId: token.affiliateId,
      hashedToken: hashToken(sessionToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await db.affiliate.update({
    where: { id: token.affiliateId },
    data: { lastPortalLoginAt: new Date() },
  });
  return { sessionToken, affiliate: await getPortalProfile(token.affiliateId) };
}

// Bearer guard for /api/affiliate/* (mirrors requireApiUser). Slides the
// 30-day expiry at most once an hour so active affiliates never get logged
// out mid-use, without a write on every request.
export async function requireAffiliate(req: Request): Promise<Affiliate | null> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!raw) return null;

  const session = await db.affiliateSession.findUnique({
    where: { hashedToken: hashToken(raw) },
    include: { affiliate: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.affiliate.applicationStatus !== "APPROVED") return null;

  if (Date.now() - session.lastSeenAt.getTime() > SESSION_SLIDE_MIN_INTERVAL_MS) {
    await db.affiliateSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }
  return session.affiliate;
}

export async function signOut(req: Request): Promise<void> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!raw) return;
  await db.affiliateSession.updateMany({
    where: { hashedToken: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ---- Terms ----

export async function getPublishedTerms(): Promise<{ version: string; bodyHtml: string } | null> {
  const row = await db.affiliateTermsSetting.findUnique({ where: { id: "singleton" } });
  return row ? { version: row.version, bodyHtml: row.bodyHtml } : null;
}

// Re-acceptance after an admin bumps the terms version: new signature stored
// alongside the old ones (prior signature files are never deleted for
// approved affiliates), acceptance metadata overwritten.
export async function acceptCurrentTerms(
  affiliate: Affiliate,
  signaturePng: Uint8Array,
  meta: SubmitMeta
): Promise<void> {
  const terms = await getPublishedTerms();
  if (!terms) throw new AffiliatePortalError("No Terms & Conditions are published yet.");
  if (sniffContentType(signaturePng) !== "image/png") {
    throw new AffiliatePortalError("The signature must be a PNG image.");
  }
  if (signaturePng.byteLength > SIGNATURE_MAX_BYTES) {
    throw new AffiliatePortalError("The signature image is too large.");
  }

  const signatureKey = await saveAffiliateFile({
    affiliateId: affiliate.id,
    kind: "SIGNATURE",
    contentType: "image/png",
    data: signaturePng,
    tcVersion: terms.version,
  });
  await db.affiliate.update({
    where: { id: affiliate.id },
    data: {
      tcVersion: terms.version,
      tcAcceptedAt: new Date(),
      tcAcceptedIp: meta.ip,
      tcAcceptedUa: meta.userAgent,
      signatureKey,
    },
  });
}

// ---- Portal data (always scoped by the session's affiliate) ----

const SCHEDULE_LABEL: Record<PayoutSchedule, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

function maskIdCardNumber(id: string | null): string | null {
  if (!id) return null;
  if (id.length <= 3) return id;
  return `${id[0]}${"•".repeat(id.length - 3)}${id.slice(-2)}`;
}

export type PortalProfile = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  idCardNumberMasked: string | null;
  commissionRate: number;
  active: boolean;
  memberSince: string; // ISO date
  payoutSchedule: PayoutSchedule;
  payoutScheduleLabel: string;
  bank: { bankName: string; accountName: string; accountNumberMasked: string } | null;
  agreement: { version: string; acceptedAt: string } | null;
  emailNotifications: boolean;
  completion: { bankDetails: boolean; currentTermsSigned: boolean };
};

export async function getPortalProfile(affiliateId: string): Promise<PortalProfile> {
  const a = await db.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
  const terms = await getPublishedTerms();
  return {
    id: a.id,
    name: a.name,
    code: a.code,
    email: a.email,
    phone: a.phone,
    idCardNumberMasked: maskIdCardNumber(a.idCardNumber),
    commissionRate: a.commissionRate,
    active: a.active,
    memberSince: (a.reviewedAt ?? a.createdAt).toISOString(),
    payoutSchedule: a.payoutSchedule,
    payoutScheduleLabel: SCHEDULE_LABEL[a.payoutSchedule],
    bank:
      a.bankName && a.bankAccountName && a.bankAccountLast4
        ? {
            bankName: a.bankName,
            accountName: a.bankAccountName,
            accountNumberMasked: `•••• ${a.bankAccountLast4}`,
          }
        : null,
    agreement:
      a.tcVersion && a.tcAcceptedAt
        ? { version: a.tcVersion, acceptedAt: a.tcAcceptedAt.toISOString() }
        : null,
    emailNotifications: a.emailNotifications,
    completion: {
      bankDetails: Boolean(a.bankAccountNoEnc),
      // No published terms yet -> nothing to sign; don't nag.
      currentTermsSigned: !terms || a.tcVersion === terms.version,
    },
  };
}

export async function setEmailNotifications(affiliateId: string, enabled: boolean): Promise<void> {
  await db.affiliate.update({
    where: { id: affiliateId },
    data: { emailNotifications: enabled },
  });
}

// Current period ("YYYY-MM") in Maldives time — the portal's projection month.
export function periodOfMv(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Maldives",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .replace("/", "-");
}

export function currentPeriodMv(): string {
  return periodOfMv(new Date());
}

// How many months of history the portal's dashboard sparklines show.
export const TREND_MONTHS = 6;

// The last `count` periods ending with `endPeriod`, oldest first:
// ["2026-03", "2026-04", ... "2026-08"]. Plain year-month arithmetic, so no
// timezone or DST surprises.
export function recentPeriods(count = TREND_MONTHS, endPeriod = currentPeriodMv()): string[] {
  const [year, month] = endPeriod.split("-").map(Number);
  const endIndex = year * 12 + (month - 1);
  return Array.from({ length: count }, (_, i) => {
    const index = endIndex - (count - 1 - i);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

export type PortalOverview = {
  affiliate: PortalProfile;
  stats: {
    merchantsBrought: number;
    earningNow: number;
    projectedThisMonthMvr: number;
    pendingTotalMvr: number;
  };
  projectionPeriod: string;
  // Real history for the dashboard sparklines — nothing is interpolated or
  // invented: merchant counts come from when each referral was created, and
  // earnings from the recorded ledger (the current month is the projection).
  trends: {
    months: string[];
    merchantsBrought: number[];
    earningsMvr: number[];
    newMerchantsThisMonth: number;
    earningsDeltaMvr: number;
  };
  recentCommissions: {
    period: string;
    amountMvr: number;
    status: "PENDING" | "PAID";
    paidAt: string | null;
  }[];
};

export async function getPortalOverview(affiliateId: string): Promise<PortalOverview> {
  const [profile, figures, pending, recent, referredAt, ledger] = await Promise.all([
    getPortalProfile(affiliateId),
    computeMonthlyByAffiliate(affiliateId),
    db.affiliateCommission.aggregate({
      where: { affiliateId, status: "PENDING" },
      _sum: { amountMvr: true },
    }),
    db.affiliateCommission.findMany({
      where: { affiliateId },
      orderBy: { period: "desc" },
      take: 3,
      select: { period: true, amountMvr: true, status: true, paidAt: true },
    }),
    db.merchant.findMany({ where: { affiliateId }, select: { createdAt: true } }),
    db.affiliateCommission.findMany({
      where: { affiliateId },
      select: { period: true, amountMvr: true },
    }),
  ]);
  const figure = figures[0];
  const currentPeriod = currentPeriodMv();
  const projectedMvr = figure?.monthlyCommissionMvr ?? 0;

  return {
    affiliate: profile,
    stats: {
      merchantsBrought: figure?.merchantsBrought ?? 0,
      earningNow: figure?.onboarded ?? 0,
      projectedThisMonthMvr: projectedMvr,
      pendingTotalMvr: pending._sum.amountMvr ?? 0,
    },
    projectionPeriod: currentPeriod,
    trends: buildTrends({
      referredAt: referredAt.map((m) => m.createdAt),
      ledger,
      currentPeriod,
      projectedMvr,
    }),
    recentCommissions: recent.map((r) => ({
      period: r.period,
      amountMvr: r.amountMvr,
      status: r.status,
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
  };
}

// Dashboard sparkline series. Merchants are cumulative (the affiliate's book
// of business only grows), earnings are per-month. The current month uses the
// live projection until an admin records the period, matching what the rest
// of the portal shows.
function buildTrends(args: {
  referredAt: Date[];
  ledger: { period: string; amountMvr: number }[];
  currentPeriod: string;
  projectedMvr: number;
}): PortalOverview["trends"] {
  const months = recentPeriods(TREND_MONTHS, args.currentPeriod);

  const referredPerPeriod = new Map<string, number>();
  for (const date of args.referredAt) {
    const period = periodOfMv(date);
    referredPerPeriod.set(period, (referredPerPeriod.get(period) ?? 0) + 1);
  }
  // Merchants referred before the window still count towards the running
  // total — "YYYY-MM" strings compare correctly as plain strings.
  let running = args.referredAt.filter((d) => periodOfMv(d) < months[0]).length;
  const merchantsBrought = months.map((period) => {
    running += referredPerPeriod.get(period) ?? 0;
    return running;
  });

  const recordedByPeriod = new Map(args.ledger.map((e) => [e.period, e.amountMvr]));
  const earningsMvr = months.map((period) => {
    const recorded = recordedByPeriod.get(period);
    if (recorded !== undefined) return recorded;
    return period === args.currentPeriod ? args.projectedMvr : 0;
  });

  return {
    months,
    merchantsBrought,
    earningsMvr,
    newMerchantsThisMonth: referredPerPeriod.get(args.currentPeriod) ?? 0,
    earningsDeltaMvr:
      earningsMvr[earningsMvr.length - 1] - (earningsMvr[earningsMvr.length - 2] ?? 0),
  };
}

// Friendly statuses only — the portal never sees raw CRM enums, and the
// response shape carries no plan/branch/MRR data (that enforcement lives
// here, not in the UI).
const PORTAL_STATUS_WHERE = {
  EARNING: { status: "ACTIVE" as const, loyaltyLive: true },
  ONBOARDING: { status: "ACTIVE" as const, loyaltyLive: false },
  IN_PROGRESS: { status: "PROSPECT" as const },
  INACTIVE: { status: "CHURNED" as const },
};

const MERCHANTS_PAGE_SIZE = 25;

export type PortalMerchant = {
  id: string;
  name: string;
  category: string | null;
  portalStatus: keyof typeof PORTAL_STATUS_WHERE;
  referredAt: string;
};

export type PortalMerchantsPage = {
  total: number;
  page: number;
  pageCount: number;
  merchants: PortalMerchant[];
};

export async function listPortalMerchants(
  affiliateId: string,
  params: PortalMerchantsParams
): Promise<PortalMerchantsPage> {
  const where = {
    affiliateId,
    ...(params.status ? PORTAL_STATUS_WHERE[params.status] : {}),
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" as const } } : {}),
  };
  const orderBy =
    params.sort === "name"
      ? { name: params.dir }
      : { createdAt: params.dir };

  const [total, rows] = await Promise.all([
    db.merchant.count({ where }),
    db.merchant.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * MERCHANTS_PAGE_SIZE,
      take: MERCHANTS_PAGE_SIZE,
      select: { id: true, name: true, category: true, status: true, loyaltyLive: true, createdAt: true },
    }),
  ]);

  return {
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / MERCHANTS_PAGE_SIZE)),
    merchants: rows.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      portalStatus:
        m.status === "CHURNED"
          ? "INACTIVE"
          : m.status === "PROSPECT"
            ? "IN_PROGRESS"
            : m.loyaltyLive
              ? "EARNING"
              : "ONBOARDING",
      referredAt: m.createdAt.toISOString(),
    })),
  };
}

export type PortalCommissions = {
  currency: "MVR";
  commissionRate: number;
  payoutSchedule: PayoutSchedule;
  lifetimePaidMvr: number;
  pendingTotalMvr: number;
  projection: { period: string; amountMvr: number; merchantCount: number };
  entries: {
    period: string;
    amountMvr: number;
    commissionRate: number;
    merchantCount: number;
    status: "PENDING" | "PAID";
    paidAt: string | null;
  }[];
};

export async function listPortalCommissions(affiliateId: string): Promise<PortalCommissions> {
  const [affiliate, figures, entries] = await Promise.all([
    db.affiliate.findUniqueOrThrow({
      where: { id: affiliateId },
      select: { commissionRate: true, payoutSchedule: true },
    }),
    computeMonthlyByAffiliate(affiliateId),
    db.affiliateCommission.findMany({
      where: { affiliateId },
      orderBy: { period: "desc" },
      select: {
        period: true,
        amountMvr: true,
        commissionRate: true,
        merchantCount: true,
        status: true,
        paidAt: true,
      },
    }),
  ]);

  const figure = figures[0];
  return {
    currency: "MVR",
    commissionRate: affiliate.commissionRate,
    payoutSchedule: affiliate.payoutSchedule,
    lifetimePaidMvr: entries
      .filter((e) => e.status === "PAID")
      .reduce((s, e) => s + e.amountMvr, 0),
    pendingTotalMvr: entries
      .filter((e) => e.status === "PENDING")
      .reduce((s, e) => s + e.amountMvr, 0),
    projection: {
      period: currentPeriodMv(),
      amountMvr: figure?.monthlyCommissionMvr ?? 0,
      merchantCount: figure?.onboarded ?? 0,
    },
    entries: entries.map((e) => ({
      period: e.period,
      amountMvr: e.amountMvr,
      commissionRate: e.commissionRate,
      merchantCount: e.merchantCount,
      status: e.status,
      paidAt: e.paidAt?.toISOString() ?? null,
    })),
  };
}

// ---- Referrals ----

export async function submitReferral(
  affiliate: Affiliate,
  input: PortalReferralInput
): Promise<void> {
  if (!affiliate.active) {
    throw new AffiliatePortalError(
      "Your affiliate account is inactive — contact the Perx team to submit referrals.",
      403
    );
  }
  const score = computeLeadScore({
    source: "REFERRAL",
    email: input.email ?? null,
    phone: input.phone ?? null,
    company: input.businessName,
    message: input.note ?? null,
  });
  const lead = await db.lead.create({
    data: {
      source: "REFERRAL",
      status: "NEW",
      score,
      name: input.contactPerson ?? null,
      company: input.businessName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      message: input.note ?? null,
      affiliateId: affiliate.id,
      ownerId: null, // unassigned: reps claim from the leads list
    },
  });
  await audit({
    actorId: null,
    action: "lead.affiliate_referral",
    entityType: "LEAD",
    entityId: lead.id,
    diff: { company: input.businessName, affiliate: affiliate.code },
  });
}

export type PortalReferral = {
  id: string;
  businessName: string;
  submittedAt: string;
  outcome: "RECEIVED" | "CONVERTED";
};

export async function listMyReferrals(affiliateId: string): Promise<PortalReferral[]> {
  const rows = await db.lead.findMany({
    where: { affiliateId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, company: true, name: true, createdAt: true, merchantId: true },
  });
  return rows.map((r) => ({
    id: r.id,
    businessName: r.company ?? r.name ?? "—",
    submittedAt: r.createdAt.toISOString(),
    outcome: r.merchantId ? "CONVERTED" : "RECEIVED",
  }));
}

// Capture-form attribution: only approved, active affiliates earn new leads.
export async function resolveReferralCode(rawCode: string): Promise<{
  id: string;
  name: string;
} | null> {
  const code = normalizeAffiliateCode(rawCode);
  if (!isValidAffiliateCode(code)) return null;
  const affiliate = await db.affiliate.findUnique({
    where: { code },
    select: { id: true, name: true, active: true, applicationStatus: true },
  });
  if (!affiliate || !affiliate.active || affiliate.applicationStatus !== "APPROVED") return null;
  return { id: affiliate.id, name: affiliate.name };
}

// ---- Bank-detail changes (payout-fraud guard) ----

// Step 1: prove inbox control before the edit form unlocks. An attacker with
// a hijacked portal session but no inbox access can't move the money.
export async function requestBankChange(affiliate: Affiliate): Promise<void> {
  if (!affiliate.email) throw new AffiliatePortalError("No email on file.");
  const raw = await issueToken(affiliate.id, "BANK_CHANGE");
  const msg = bankChangeConfirmEmail(portalUrl(`/profile/bank?token=${raw}`));
  await sendAffiliateEmail(affiliate.email, msg.subject, msg.bodyHtml);
}

// Step 2: consume the emailed token and apply the change. Both the affiliate
// and every admin are notified, and the change is audit-logged.
export async function applyBankChange(
  affiliate: Affiliate,
  input: BankApplyChangeInput
): Promise<void> {
  const token = await findToken(input.token, "BANK_CHANGE", true);
  if (!token || token.affiliateId !== affiliate.id) {
    throw new AffiliatePortalError(
      "That confirmation link has expired or was already used — request a new one.",
      401
    );
  }

  await db.affiliate.update({
    where: { id: affiliate.id },
    data: {
      bankName: input.bankName,
      bankAccountName: input.bankAccountName,
      bankAccountNoEnc: encryptSecret(input.bankAccountNumber),
      bankAccountLast4: input.bankAccountNumber.slice(-4),
    },
  });

  const last4 = input.bankAccountNumber.slice(-4);
  if (affiliate.email) {
    const msg = bankChangedAffiliateEmail();
    await sendAffiliateEmail(affiliate.email, msg.subject, msg.bodyHtml);
  }
  const adminMsg = bankChangedAdminEmail({ name: affiliate.name, code: affiliate.code, last4 });
  await notifyAdmins(adminMsg.subject, adminMsg.bodyHtml);

  await audit({
    actorId: null,
    action: "affiliate.bank_change",
    entityType: "AFFILIATE",
    entityId: affiliate.id,
    diff: { bankName: input.bankName, last4 },
  });
}

// ---- Admin review (CRM UI; session-authed, ADMIN-only) ----

export type ApplicationListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  idCardNumber: string | null;
  idDocumentKey: string | null;
  idDocumentIsPdf: boolean;
  signatureKey: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
  tcVersion: string | null;
  tcAcceptedAt: Date | null;
  appliedAt: Date | null;
  priorRejection: { reviewedAt: Date | null; reviewNote: string | null } | null;
};

export async function listApplications(ctx: SessionUser): Promise<ApplicationListItem[]> {
  assertAdmin(ctx);
  const rows = await db.affiliate.findMany({
    where: { applicationStatus: "PENDING_REVIEW", appliedAt: { not: null } },
    orderBy: { appliedAt: "asc" },
  });

  // Show a re-applicant's prior rejection to the reviewing admin.
  const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
  const priors = emails.length
    ? await db.affiliate.findMany({
        where: { applicationStatus: "REJECTED", email: { in: emails } },
        orderBy: { reviewedAt: "desc" },
        select: { email: true, reviewedAt: true, reviewNote: true },
      })
    : [];
  const priorByEmail = new Map(priors.map((p) => [p.email, p]));

  // The drawer needs to know whether to render the ID document as an image
  // or a PDF iframe.
  const idKeys = rows.map((r) => r.idDocumentKey).filter((k): k is string => Boolean(k));
  const idFiles = idKeys.length
    ? await db.affiliateFile.findMany({
        where: { id: { in: idKeys } },
        select: { id: true, contentType: true },
      })
    : [];
  const typeByKey = new Map(idFiles.map((f) => [f.id, f.contentType]));

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    idCardNumber: a.idCardNumber,
    idDocumentKey: a.idDocumentKey,
    idDocumentIsPdf: a.idDocumentKey
      ? typeByKey.get(a.idDocumentKey) === "application/pdf"
      : false,
    signatureKey: a.signatureKey,
    bankName: a.bankName,
    bankAccountName: a.bankAccountName,
    bankAccountLast4: a.bankAccountLast4,
    tcVersion: a.tcVersion,
    tcAcceptedAt: a.tcAcceptedAt,
    appliedAt: a.appliedAt,
    priorRejection: a.email ? (priorByEmail.get(a.email) ?? null) : null,
  }));
}

export async function countPendingApplications(ctx: SessionUser): Promise<number> {
  if (!isAdmin(ctx)) return 0;
  return db.affiliate.count({
    where: { applicationStatus: "PENDING_REVIEW", appliedAt: { not: null } },
  });
}

export async function approveApplication(
  ctx: SessionUser,
  affiliateId: string,
  input: ApproveApplicationInput
): Promise<void> {
  assertAdmin(ctx);
  const a = await db.affiliate.findUnique({ where: { id: affiliateId } });
  if (!a || a.applicationStatus !== "PENDING_REVIEW" || !a.appliedAt) {
    throw new AffiliatePortalError("Application not found or already reviewed.", 404);
  }
  await db.affiliate.update({
    where: { id: affiliateId },
    data: {
      applicationStatus: "APPROVED",
      active: true,
      commissionRate: input.commissionRate,
      payoutSchedule: input.payoutSchedule,
      reviewedAt: new Date(),
      reviewedById: ctx.id,
    },
  });
  if (a.email) {
    const msg = applicationApprovedEmail({
      name: a.name,
      code: a.code,
      commissionRate: input.commissionRate,
      payoutSchedule: input.payoutSchedule,
    });
    await sendAffiliateEmail(a.email, msg.subject, msg.bodyHtml);
  }
  await audit({
    actorId: ctx.id,
    action: "affiliate.approve",
    entityType: "AFFILIATE",
    entityId: affiliateId,
    diff: { commissionRate: input.commissionRate, payoutSchedule: input.payoutSchedule },
  });
}

export async function rejectApplication(
  ctx: SessionUser,
  affiliateId: string,
  note?: string
): Promise<void> {
  assertAdmin(ctx);
  const a = await db.affiliate.findUnique({ where: { id: affiliateId } });
  if (!a || a.applicationStatus !== "PENDING_REVIEW" || !a.appliedAt) {
    throw new AffiliatePortalError("Application not found or already reviewed.", 404);
  }
  await db.affiliate.update({
    where: { id: affiliateId },
    data: {
      applicationStatus: "REJECTED",
      active: false,
      reviewNote: note ?? null,
      reviewedAt: new Date(),
      reviewedById: ctx.id,
    },
  });
  if (a.email) {
    const msg = applicationRejectedEmail(note);
    await sendAffiliateEmail(a.email, msg.subject, msg.bodyHtml);
  }
  await audit({
    actorId: ctx.id,
    action: "affiliate.reject",
    entityType: "AFFILIATE",
    entityId: affiliateId,
    diff: { note: note ?? null },
  });
}

// ADMIN-only decrypt-on-demand, always audit-logged (payout verification).
export async function revealBankAccount(ctx: SessionUser, affiliateId: string): Promise<string> {
  assertAdmin(ctx);
  const a = await db.affiliate.findUnique({
    where: { id: affiliateId },
    select: { bankAccountNoEnc: true },
  });
  if (!a?.bankAccountNoEnc) throw new AffiliatePortalError("No bank account on file.", 404);
  const plain = decryptSecret(a.bankAccountNoEnc);
  if (!plain) throw new AffiliatePortalError("Could not decrypt the account number.");
  await audit({
    actorId: ctx.id,
    action: "affiliate.bank_reveal",
    entityType: "AFFILIATE",
    entityId: affiliateId,
  });
  return plain;
}

// Serve a private upload to an ADMIN (the applications drawer's image/PDF
// viewer). The route handler enforces the session; this enforces the role.
export async function getAffiliateFileForAdmin(ctx: SessionUser, fileId: string) {
  assertAdmin(ctx);
  return db.affiliateFile.findUnique({ where: { id: fileId } });
}

// ---- Terms editor (admin) ----

export async function saveTermsSetting(ctx: SessionUser, input: TermsSettingInput): Promise<void> {
  assertAdmin(ctx);
  await db.affiliateTermsSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", version: input.version, bodyHtml: input.bodyHtml },
    update: { version: input.version, bodyHtml: input.bodyHtml },
  });
  await audit({
    actorId: ctx.id,
    action: "affiliate.terms_update",
    entityType: "AFFILIATE_TERMS",
    entityId: "singleton",
    diff: { version: input.version },
  });
}

// ---- Retention (cron) ----

const DRAFT_PURGE_MS = 7 * 24 * 60 * 60 * 1000;
const REJECTED_FILE_PURGE_MS = 30 * 24 * 60 * 60 * 1000;

// Abandoned (never-submitted) drafts purge whole after 7 days; rejected
// applications keep the row (re-application context for admins) but lose the
// ID document and signature after 30 days.
export async function purgeExpiredRegistrationData(): Promise<{
  draftsDeleted: number;
  rejectedFilesCleared: number;
}> {
  const draftCutoff = new Date(Date.now() - DRAFT_PURGE_MS);
  const drafts = await db.affiliate.deleteMany({
    where: {
      applicationStatus: "PENDING_REVIEW",
      appliedAt: null,
      // Never touch legacy admin-created affiliates: they're APPROVED, and
      // this filter additionally requires a self-registration draft shape.
      commissionRate: 0,
      active: false,
      createdAt: { lt: draftCutoff },
    },
  });

  const rejectedCutoff = new Date(Date.now() - REJECTED_FILE_PURGE_MS);
  const rejected = await db.affiliate.findMany({
    where: {
      applicationStatus: "REJECTED",
      reviewedAt: { lt: rejectedCutoff },
      OR: [{ idDocumentKey: { not: null } }, { signatureKey: { not: null } }],
    },
    select: { id: true },
  });
  for (const r of rejected) {
    await deleteAffiliateFiles(r.id);
    await db.affiliate.update({
      where: { id: r.id },
      data: { idDocumentKey: null, signatureKey: null },
    });
  }

  return { draftsDeleted: drafts.count, rejectedFilesCleared: rejected.length };
}
