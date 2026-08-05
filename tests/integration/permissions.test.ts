import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { getMerchantAccess } from "@/services/merchant-access";
import { resetTeamPassword, setTeamDisabled, setTeamRole } from "@/services/users";

// Two policies, both security-relevant:
//  1. Editing records is team-wide; deleting and share management are not.
//  2. Only the owner account may act on another ADMIN.

const suffix = `perm-${Math.random().toString(36).slice(2, 8)}`;
let ownerId: string;
let adminId: string;
let otherAdminId: string;
let repId: string;
let merchantId: string;

const asUser = (id: string, role: "ADMIN" | "SALES_REP"): SessionUser => ({
  id,
  role,
  name: "T",
  email: `${id}@test.mv`,
});

beforeAll(async () => {
  const owner = await db.user.create({
    data: { name: "Owner", email: `own-${suffix}@test.mv`, role: "ADMIN", isOwner: true },
  });
  const admin = await db.user.create({
    data: { name: "Admin", email: `adm-${suffix}@test.mv`, role: "ADMIN" },
  });
  const other = await db.user.create({
    data: { name: "Other admin", email: `oth-${suffix}@test.mv`, role: "ADMIN" },
  });
  const rep = await db.user.create({
    data: { name: "Rep", email: `rep-${suffix}@test.mv`, role: "SALES_REP" },
  });
  ownerId = owner.id;
  adminId = admin.id;
  otherAdminId = other.id;
  repId = rep.id;

  // Owned by the rep, so another user editing it is the case under test.
  const merchant = await db.merchant.create({
    data: { name: `M ${suffix}`, ownerId: repId },
  });
  merchantId = merchant.id;
});

afterAll(async () => {
  await db.merchant.deleteMany({ where: { id: merchantId } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [ownerId, adminId, otherAdminId, repId] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
});

describe("record editing is team-wide", () => {
  it("lets a rep edit a merchant they don't own", async () => {
    const access = await getMerchantAccess(asUser(repId, "SALES_REP"), merchantId);
    expect(access?.canEdit).toBe(true);
  });

  it("still reserves delete and share management for the owner or an admin", async () => {
    const stranger = await db.user.create({
      data: { name: "Stranger", email: `str-${suffix}@test.mv`, role: "SALES_REP" },
    });
    const access = await getMerchantAccess(asUser(stranger.id, "SALES_REP"), merchantId);
    expect(access?.canEdit).toBe(true);
    expect(access?.canDelete).toBe(false);
    expect(access?.canManageShares).toBe(false);
  });
});

describe("only the owner may act on another admin", () => {
  it("blocks a non-owner admin from resetting another admin's password", async () => {
    await expect(
      resetTeamPassword(asUser(adminId, "ADMIN"), {
        userId: otherAdminId,
        password: "hunter2hunter2",
      })
    ).rejects.toThrow(/owner account/i);
  });

  it("blocks a non-owner admin from disabling another admin", async () => {
    await expect(
      setTeamDisabled(asUser(adminId, "ADMIN"), { userId: otherAdminId, disabled: true })
    ).rejects.toThrow(/owner account/i);
  });

  it("blocks a non-owner admin from demoting another admin", async () => {
    await expect(
      setTeamRole(asUser(adminId, "ADMIN"), { userId: otherAdminId, role: "SALES_REP" })
    ).rejects.toThrow(/owner account/i);
  });

  it("lets the owner reset another admin's password", async () => {
    await resetTeamPassword(asUser(ownerId, "ADMIN"), {
      userId: otherAdminId,
      password: "hunter2hunter2",
    });
    const after = await db.user.findUnique({ where: { id: otherAdminId } });
    expect(after?.passwordHash).toBeTruthy();
  });

  it("still lets any admin reset a sales rep's password", async () => {
    await resetTeamPassword(asUser(adminId, "ADMIN"), {
      userId: repId,
      password: "hunter2hunter2",
    });
    const after = await db.user.findUnique({ where: { id: repId } });
    expect(after?.passwordHash).toBeTruthy();
  });

  it("lets an admin change their own password", async () => {
    await resetTeamPassword(asUser(adminId, "ADMIN"), {
      userId: adminId,
      password: "hunter2hunter2",
    });
    const after = await db.user.findUnique({ where: { id: adminId } });
    expect(after?.passwordHash).toBeTruthy();
  });
});
