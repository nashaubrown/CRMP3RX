import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { getMerchantAccess } from "@/services/merchant-access";
import { removeMerchantShare, setMerchantShare } from "@/services/merchant-shares";
import { createMerchant, deleteMerchant, updateMerchant } from "@/services/merchants";

// Integration tests against the local docker-compose Postgres. They create
// their own users/merchants (unique suffix) and clean up after themselves.

const suffix = `itest-${Math.random().toString(36).slice(2, 8)}`;

let owner: SessionUser;
let teammate: SessionUser;
let admin: SessionUser;
let merchantId: string;

const baseInput = {
  name: `Integration Test Merchant ${suffix}`,
  status: "PROSPECT" as const,
  loyaltyLive: false,
  beta: false,
  phone: undefined,
  monthlyTxnVolume: undefined,
  branches: undefined,
};

beforeAll(async () => {
  const [ownerUser, teammateUser, adminUser] = await Promise.all([
    db.user.create({ data: { name: "IT Owner", email: `owner-${suffix}@test.mv`, role: "SALES_REP" } }),
    db.user.create({ data: { name: "IT Teammate", email: `mate-${suffix}@test.mv`, role: "SALES_REP" } }),
    db.user.create({ data: { name: "IT Admin", email: `admin-${suffix}@test.mv`, role: "ADMIN" } }),
  ]);
  owner = { id: ownerUser.id, role: "SALES_REP", name: ownerUser.name };
  teammate = { id: teammateUser.id, role: "SALES_REP", name: teammateUser.name };
  admin = { id: adminUser.id, role: "ADMIN", name: adminUser.name };
});

afterAll(async () => {
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [owner.id, teammate.id, admin.id] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("merchant access (hybrid sharing model)", () => {
  it("creates a merchant owned by the creator and audit-logs it", async () => {
    const merchant = await createMerchant(owner, baseInput);
    merchantId = merchant.id;
    expect(merchant.ownerId).toBe(owner.id);

    const auditRow = await db.auditLog.findFirst({
      where: { action: "merchant.create", entityId: merchant.id },
    });
    expect(auditRow?.actorId).toBe(owner.id);
    expect(auditRow?.merchantId).toBe(merchant.id);
  });

  it("teammates can view but not edit by default", async () => {
    const access = await getMerchantAccess(teammate, merchantId);
    expect(access?.canEdit).toBe(false);
    expect(access?.canDelete).toBe(false);
    expect(access?.canViewHistory).toBe(false);

    await expect(
      updateMerchant(teammate, merchantId, { ...baseInput, status: "ACTIVE" })
    ).rejects.toThrow(/edit access/);
  });

  it("an EDIT share grants editing but not delete/history", async () => {
    await setMerchantShare(owner, merchantId, teammate.id, "EDIT");

    const access = await getMerchantAccess(teammate, merchantId);
    expect(access?.canEdit).toBe(true);
    expect(access?.canDelete).toBe(false);
    expect(access?.canViewHistory).toBe(false);

    const updated = await updateMerchant(teammate, merchantId, {
      ...baseInput,
      status: "ACTIVE",
    });
    expect(updated.status).toBe("ACTIVE");

    // The edit shows up in the owner-visible history rollup with a diff
    const auditRow = await db.auditLog.findFirst({
      where: { action: "merchant.update", merchantId },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow?.actorId).toBe(teammate.id);
    expect((auditRow?.diff as { status?: { to: string } })?.status?.to).toBe("ACTIVE");
  });

  it("downgrading to VIEW revokes editing", async () => {
    await setMerchantShare(owner, merchantId, teammate.id, "VIEW");
    const access = await getMerchantAccess(teammate, merchantId);
    expect(access?.canEdit).toBe(false);
  });

  it("only owner or admin manage shares", async () => {
    await expect(
      setMerchantShare(teammate, merchantId, teammate.id, "EDIT")
    ).rejects.toThrow(/owner or an admin/);
    await removeMerchantShare(admin, merchantId, teammate.id);
    const shares = await db.merchantShare.count({ where: { merchantId } });
    expect(shares).toBe(0);
  });

  it("non-owners cannot delete; owners can", async () => {
    await expect(deleteMerchant(teammate, merchantId)).rejects.toThrow(/owner or an admin/);
    await deleteMerchant(owner, merchantId);
    expect(await db.merchant.findUnique({ where: { id: merchantId } })).toBeNull();
  });
});
