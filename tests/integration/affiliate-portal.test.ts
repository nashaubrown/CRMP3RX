import { describe, expect, it, beforeAll } from "vitest";

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { SessionUser } from "@/lib/authz";
import {
  applyBankChange,
  approveApplication,
  currentPeriodMv,
  getApplicationStatus,
  getPortalOverview,
  getPortalProfile,
  hashToken,
  listPortalCommissions,
  listPortalMerchants,
  purgeExpiredRegistrationData,
  rejectApplication,
  requireAffiliate,
  resolveReferralCode,
  startRegistration,
  submitApplication,
  verifyLoginToken,
  verifyRegistrationEmail,
} from "@/services/affiliate-portal";
import { computeMonthlyByAffiliate, getAffiliateReport } from "@/services/affiliates";

// End-to-end coverage of the affiliate portal backend: the registration state
// machine, token lifecycles, session auth + scoping, bank-change protection,
// projection parity with the admin report, and the retention purge.

const suffix = `ap-${Math.random().toString(36).slice(2, 8)}`;
const email = `applicant-${suffix}@t.mv`;
let admin: SessionUser;

// Tokens are emailed in production, so tests mint known raw tokens directly.
// hashedToken is globally unique and consumed rows persist, so clear any row
// left by a previous run before planting.
async function plantToken(
  affiliateId: string,
  purpose: "LOGIN" | "REGISTER_EMAIL" | "DRAFT" | "BANK_CHANGE" | "APPLICATION_STATUS",
  raw: string,
  expiresInMs = 15 * 60 * 1000
) {
  await db.affiliateLoginToken.deleteMany({ where: { hashedToken: hashToken(raw) } });
  await db.affiliateLoginToken.create({
    data: {
      affiliateId,
      purpose,
      hashedToken: hashToken(raw),
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });
}

// A per-run 6-digit verification code (avoids cross-run hash collisions).
const RUN_CODE = String(100000 + Math.floor(Math.random() * 900000));

// Minimal byte payloads that pass magic-byte sniffing.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeAll(async () => {
  const adminUser = await db.user.create({
    data: { name: `Portal Admin ${suffix}`, email: `padmin-${suffix}@t.mv`, role: "ADMIN" },
  });
  admin = { id: adminUser.id, role: "ADMIN", name: adminUser.name };
  await db.affiliateTermsSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", version: "test-v1", bodyHtml: "<p>Terms</p>" },
    update: { version: "test-v1", bodyHtml: "<p>Terms</p>" },
  });
});

describe("registration state machine", () => {
  it("start creates an inactive PENDING_REVIEW draft with an inert code", async () => {
    await startRegistration({ fullName: "Aisha Test", email, phone: "+9607771234" });
    const draft = await db.affiliate.findFirst({ where: { email } });
    expect(draft).toBeTruthy();
    expect(draft!.applicationStatus).toBe("PENDING_REVIEW");
    expect(draft!.active).toBe(false);
    expect(draft!.appliedAt).toBeNull();
    expect(draft!.code).toHaveLength(6);
    // The draft's referral code must not resolve for attribution yet.
    expect(await resolveReferralCode(draft!.code)).toBeNull();
  });

  it("verify-email consumes the code and mints a draft token", async () => {
    const draft = await db.affiliate.findFirstOrThrow({ where: { email } });
    // Wrong code first
    expect(await verifyRegistrationEmail(email, "000000")).toBeNull();

    await db.affiliateLoginToken.deleteMany({ where: { affiliateId: draft.id } });
    await plantToken(draft.id, "REGISTER_EMAIL", RUN_CODE);
    const res = await verifyRegistrationEmail(email, RUN_CODE);
    expect(res?.draftToken).toBeTruthy();
    expect(res?.fullName).toBe("Aisha Test");

    const updated = await db.affiliate.findUniqueOrThrow({ where: { id: draft.id } });
    expect(updated.emailVerifiedAt).toBeTruthy();

    // Single-use: the same code no longer works.
    expect(await verifyRegistrationEmail(email, RUN_CODE)).toBeNull();
  });

  it("submit stores files, encrypts the account number and stamps the agreement", async () => {
    const draft = await db.affiliate.findFirstOrThrow({ where: { email } });
    await plantToken(draft.id, "DRAFT", `draft-${suffix}`, 7 * 24 * 60 * 60 * 1000);

    await submitApplication(
      {
        draftToken: `draft-${suffix}`,
        idCardNumber: "A123456",
        bankName: "Bank of Maldives",
        bankAccountName: "Aisha Test",
        bankAccountNumber: "77001234567890",
        tcVersion: "test-v1",
        agree: "true",
      },
      { idDocument: { bytes: JPEG, declaredType: "image/jpeg" }, signature: { bytes: PNG } },
      { ip: "1.2.3.4", userAgent: "vitest" }
    );

    const a = await db.affiliate.findUniqueOrThrow({ where: { id: draft.id } });
    expect(a.appliedAt).toBeTruthy();
    expect(a.bankAccountLast4).toBe("7890");
    expect(decryptSecret(a.bankAccountNoEnc!)).toBe("77001234567890");
    expect(a.tcVersion).toBe("test-v1");
    expect(a.tcAcceptedIp).toBe("1.2.3.4");
    const files = await db.affiliateFile.findMany({ where: { affiliateId: a.id } });
    expect(files.map((f) => f.kind).sort()).toEqual(["ID_DOCUMENT", "SIGNATURE"]);
  });

  it("rejects a submit whose signature is not a real PNG", async () => {
    const other = await db.affiliate.create({
      data: {
        name: "Sniff Test",
        email: `sniff-${suffix}@t.mv`,
        code: `S${suffix.slice(0, 5).toUpperCase()}`,
        active: false,
        applicationStatus: "PENDING_REVIEW",
        emailVerifiedAt: new Date(),
      },
    });
    await plantToken(other.id, "DRAFT", `draft2-${suffix}`);
    await expect(
      submitApplication(
        {
          draftToken: `draft2-${suffix}`,
          idCardNumber: "A654321",
          bankName: "MIB",
          bankAccountName: "Sniff Test",
          bankAccountNumber: "1234567890",
          tcVersion: "test-v1",
          agree: "true",
        },
        {
          idDocument: { bytes: JPEG, declaredType: "image/jpeg" },
          signature: { bytes: JPEG }, // JPEG claiming to be the signature PNG
        },
        { ip: null, userAgent: null }
      )
    ).rejects.toThrow(/PNG/);
  });

  it("status token reports the application state without PII", async () => {
    const draft = await db.affiliate.findFirstOrThrow({ where: { email } });
    await plantToken(draft.id, "APPLICATION_STATUS", `status-${suffix}`);
    expect(await getApplicationStatus(`status-${suffix}`)).toBe("UNDER_REVIEW");
    expect(await getApplicationStatus("bogus")).toBeNull();
  });
});

describe("review, login and scoping", () => {
  it("approval activates the affiliate and their referral code", async () => {
    const a = await db.affiliate.findFirstOrThrow({ where: { email } });
    await approveApplication(admin, a.id, { commissionRate: 10, payoutSchedule: "QUARTERLY" });
    const approved = await db.affiliate.findUniqueOrThrow({ where: { id: a.id } });
    expect(approved.applicationStatus).toBe("APPROVED");
    expect(approved.active).toBe(true);
    expect(approved.commissionRate).toBe(10);
    expect(approved.payoutSchedule).toBe("QUARTERLY");
    expect(await resolveReferralCode(approved.code)).toMatchObject({ id: a.id });
  });

  it("login token mints a session; requireAffiliate honors and slides it", async () => {
    const a = await db.affiliate.findFirstOrThrow({ where: { email } });
    await plantToken(a.id, "LOGIN", `login-${suffix}`);
    const session = await verifyLoginToken(`login-${suffix}`);
    expect(session?.affiliate.id).toBe(a.id);
    // Single use
    expect(await verifyLoginToken(`login-${suffix}`)).toBeNull();

    const req = new Request("http://test/api/affiliate/me", {
      headers: { authorization: `Bearer ${session!.sessionToken}` },
    });
    const affiliate = await requireAffiliate(req);
    expect(affiliate?.id).toBe(a.id);

    const bad = new Request("http://test/api/affiliate/me", {
      headers: { authorization: "Bearer nope" },
    });
    expect(await requireAffiliate(bad)).toBeNull();
  });

  it("portal queries are scoped to the session affiliate", async () => {
    const a = await db.affiliate.findFirstOrThrow({ where: { email } });
    const stranger = await db.affiliate.create({
      data: {
        name: `Other ${suffix}`,
        code: `Z${suffix.slice(0, 5).toUpperCase()}`,
        applicationStatus: "APPROVED",
        commissionRate: 5,
      },
    });
    const owner = await db.user.create({
      data: { name: `Rep ${suffix}`, email: `rep2-${suffix}@t.mv` },
    });
    await db.merchant.create({
      data: { name: `Mine ${suffix}`, ownerId: owner.id, affiliateId: a.id },
    });
    await db.merchant.create({
      data: { name: `Theirs ${suffix}`, ownerId: owner.id, affiliateId: stranger.id },
    });
    await db.affiliateCommission.create({
      data: {
        affiliateId: stranger.id,
        period: "2098-01",
        amountMvr: 999,
        commissionRate: 5,
        merchantCount: 1,
        recordedById: admin.id,
      },
    });

    const merchants = await listPortalMerchants(a.id, {
      sort: "referredAt",
      dir: "desc",
      page: 1,
    });
    expect(merchants.merchants.map((m) => m.name)).toEqual([`Mine ${suffix}`]);
    // No pricing-adjacent fields in the payload shape.
    expect(Object.keys(merchants.merchants[0]).sort()).toEqual(
      ["category", "id", "name", "portalStatus", "referredAt"].sort()
    );

    const commissions = await listPortalCommissions(a.id);
    expect(commissions.entries.find((e) => e.period === "2098-01")).toBeUndefined();
  });

  it("projection parity: the portal's projected month equals the admin report row", async () => {
    const a = await db.affiliate.findFirstOrThrow({ where: { email } });
    const [figure] = await computeMonthlyByAffiliate(a.id);
    const report = await getAffiliateReport(1);
    const row = report.rows.find((r) => r.affiliateId === a.id);
    expect(row).toBeTruthy();
    expect(figure.monthlyCommissionMvr).toBe(row!.monthlyCommissionMvr);
    expect(figure.onboarded).toBe(row!.onboarded);

    const overview = await getPortalOverview(a.id);
    expect(overview.stats.projectedThisMonthMvr).toBe(row!.monthlyCommissionMvr);
    expect(overview.projectionPeriod).toBe(currentPeriodMv());
  });

  it("profile masks the ID number and account number", async () => {
    const a = await db.affiliate.findFirstOrThrow({ where: { email } });
    const profile = await getPortalProfile(a.id);
    expect(profile.idCardNumberMasked).toBe("A••••56");
    expect(profile.bank?.accountNumberMasked).toBe("•••• 7890");
    expect(JSON.stringify(profile)).not.toContain("77001234567890");
  });
});

describe("bank changes", () => {
  it("applies only with a valid token belonging to the same affiliate", async () => {
    const a = await db.affiliate.findFirstOrThrow({ where: { email } });
    const input = {
      bankName: "Maldives Islamic Bank",
      bankAccountName: "Aisha Test",
      bankAccountNumber: "990011223344",
    };

    await expect(applyBankChange(a, { token: "missing", ...input })).rejects.toThrow(/expired/);

    // A token minted for a different affiliate must not work.
    const other = await db.affiliate.findFirstOrThrow({ where: { name: `Other ${suffix}` } });
    await plantToken(other.id, "BANK_CHANGE", `bank-other-${suffix}`);
    await expect(
      applyBankChange(a, { token: `bank-other-${suffix}`, ...input })
    ).rejects.toThrow(/expired/);

    await plantToken(a.id, "BANK_CHANGE", `bank-${suffix}`);
    await applyBankChange(a, { token: `bank-${suffix}`, ...input });
    const updated = await db.affiliate.findUniqueOrThrow({ where: { id: a.id } });
    expect(updated.bankAccountLast4).toBe("3344");
    expect(decryptSecret(updated.bankAccountNoEnc!)).toBe("990011223344");

    const auditRow = await db.auditLog.findFirst({
      where: { action: "affiliate.bank_change", entityId: a.id },
    });
    expect(auditRow).toBeTruthy();
  });
});

describe("rejection and retention", () => {
  it("rejection deactivates; the purge clears files after 30 days", async () => {
    const rej = await db.affiliate.create({
      data: {
        name: `Reject Me ${suffix}`,
        email: `reject-${suffix}@t.mv`,
        code: `R${suffix.slice(0, 5).toUpperCase()}`,
        active: false,
        applicationStatus: "PENDING_REVIEW",
        emailVerifiedAt: new Date(),
        appliedAt: new Date(),
      },
    });
    const file = await db.affiliateFile.create({
      data: {
        affiliateId: rej.id,
        kind: "ID_DOCUMENT",
        contentType: "image/jpeg",
        sizeBytes: JPEG.byteLength,
        data: Buffer.from(JPEG),
      },
    });
    await db.affiliate.update({ where: { id: rej.id }, data: { idDocumentKey: file.id } });

    await rejectApplication(admin, rej.id, "Document unreadable");
    const rejected = await db.affiliate.findUniqueOrThrow({ where: { id: rej.id } });
    expect(rejected.applicationStatus).toBe("REJECTED");

    // Not yet 30 days: files survive the purge.
    await purgeExpiredRegistrationData();
    expect(await db.affiliateFile.count({ where: { affiliateId: rej.id } })).toBe(1);

    // Age the rejection past the cutoff.
    await db.affiliate.update({
      where: { id: rej.id },
      data: { reviewedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    const purged = await purgeExpiredRegistrationData();
    expect(purged.rejectedFilesCleared).toBeGreaterThanOrEqual(1);
    expect(await db.affiliateFile.count({ where: { affiliateId: rej.id } })).toBe(0);
    const cleared = await db.affiliate.findUniqueOrThrow({ where: { id: rej.id } });
    expect(cleared.idDocumentKey).toBeNull();
  });

  it("abandoned drafts purge after 7 days; fresh drafts and legacy affiliates survive", async () => {
    const oldDraft = await db.affiliate.create({
      data: {
        name: `Old Draft ${suffix}`,
        email: `olddraft-${suffix}@t.mv`,
        code: `D${suffix.slice(0, 5).toUpperCase()}`,
        active: false,
        applicationStatus: "PENDING_REVIEW",
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    });
    const freshDraft = await db.affiliate.create({
      data: {
        name: `Fresh Draft ${suffix}`,
        email: `freshdraft-${suffix}@t.mv`,
        code: `F${suffix.slice(0, 5).toUpperCase()}`,
        active: false,
        applicationStatus: "PENDING_REVIEW",
      },
    });

    await purgeExpiredRegistrationData();
    expect(await db.affiliate.findUnique({ where: { id: oldDraft.id } })).toBeNull();
    expect(await db.affiliate.findUnique({ where: { id: freshDraft.id } })).toBeTruthy();
  });
});
