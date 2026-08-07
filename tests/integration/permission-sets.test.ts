import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { exportMerchantsCsv } from "@/services/csv";
import { getOwnerBreakdown } from "@/services/dashboard";
import { getMerchant, listMerchants } from "@/services/merchants";
import { getCapabilities, PermissionError } from "@/services/permissions";
import { quickSearch } from "@/services/search";

// Capability enforcement. Admins are never restricted; a rep gets whatever
// their permission set allows, and every merchant read path honours it.

const suffix = `ps-${Math.random().toString(36).slice(2, 8)}`;
const token = `Quixotl${suffix.slice(-4)}`;

let restrictedId: string;
let openId: string;
let otherRepId: string;
let ownMerchantId: string;
let otherMerchantId: string;
let restrictedSetId: string;

const asRep = (id: string): SessionUser => ({ id, role: "SALES_REP", name: "R", email: `${id}@t.mv` });
// A real row, not a made-up id: exporting now writes an AuditLog entry, and
// AuditLog.actorId is a foreign key.
let admin: SessionUser;

beforeAll(async () => {
  const set = await db.permissionSet.create({
    data: {
      name: `Locked down ${suffix}`,
      canExportData: false,
      canSeeAllMerchants: false,
      canSeeTeamNumbers: false,
    },
  });
  restrictedSetId = set.id;

  const openSet = await db.permissionSet.create({
    data: {
      name: `Wide open ${suffix}`,
      canExportData: true,
      canSeeAllMerchants: true,
      canSeeTeamNumbers: true,
    },
  });

  const adminUser = await db.user.create({
    data: { name: "Perm Admin", email: `adm-${suffix}@t.mv`, role: "ADMIN" },
  });
  admin = { id: adminUser.id, role: "ADMIN", name: adminUser.name, email: adminUser.email };

  const [restricted, open, other] = await Promise.all([
    db.user.create({
      data: {
        name: "Restricted",
        email: `r-${suffix}@t.mv`,
        role: "SALES_REP",
        permissionSetId: set.id,
      },
    }),
    db.user.create({
      data: {
        name: "Open",
        email: `o-${suffix}@t.mv`,
        role: "SALES_REP",
        permissionSetId: openSet.id,
      },
    }),
    db.user.create({ data: { name: "Other", email: `x-${suffix}@t.mv`, role: "SALES_REP" } }),
  ]);
  restrictedId = restricted.id;
  openId = open.id;
  otherRepId = other.id;

  const [own, others] = await Promise.all([
    db.merchant.create({ data: { name: `${token} Mine`, ownerId: restrictedId } }),
    db.merchant.create({ data: { name: `${token} Theirs`, ownerId: otherRepId } }),
  ]);
  ownMerchantId = own.id;
  otherMerchantId = others.id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actor: { email: { contains: suffix } } } });
  await db.merchant.deleteMany({ where: { name: { contains: token } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.permissionSet.deleteMany({ where: { name: { contains: suffix } } });
});

describe("capability resolution", () => {
  it("gives admins everything regardless of any set", async () => {
    const caps = await getCapabilities(admin);
    expect(caps).toEqual({
      canExportData: true,
      canSeeAllMerchants: true,
      canSeeTeamNumbers: true,
    });
  });

  it("uses the rep's own set", async () => {
    expect(await getCapabilities(asRep(restrictedId))).toEqual({
      canExportData: false,
      canSeeAllMerchants: false,
      canSeeTeamNumbers: false,
    });
  });

  it("falls back to the default set when a rep has none", async () => {
    const caps = await getCapabilities(asRep(otherRepId));
    // The shipped default allows seeing everything but not exporting.
    expect(caps.canExportData).toBe(false);
    expect(caps.canSeeAllMerchants).toBe(true);
  });
});

describe("export capability", () => {
  it("refuses a rep without it", async () => {
    await expect(exportMerchantsCsv(asRep(restrictedId), {})).rejects.toBeInstanceOf(
      PermissionError
    );
  });

  it("allows a rep who has it", async () => {
    await expect(exportMerchantsCsv(asRep(openId), {})).resolves.toContain("name");
  });

  it("allows an admin", async () => {
    await expect(exportMerchantsCsv(admin, {})).resolves.toContain("name");
  });
});

describe("merchant visibility", () => {
  it("hides other reps' merchants from the list", async () => {
    const { items } = await listMerchants(asRep(restrictedId), {
      scope: "all",
      page: 1,
      sort: "updatedAt",
      dir: "desc",
    });
    const names = items.map((m) => m.name);
    expect(names).toContain(`${token} Mine`);
    expect(names).not.toContain(`${token} Theirs`);
  });

  it("refuses to open another rep's merchant directly", async () => {
    expect(await getMerchant(asRep(restrictedId), otherMerchantId)).toBeNull();
    expect(await getMerchant(asRep(restrictedId), ownMerchantId)).not.toBeNull();
  });

  it("keeps other reps' merchants out of ⌘K", async () => {
    const hits = await quickSearch(asRep(restrictedId), token);
    const titles = hits.map((h) => h.title);
    expect(titles).toContain(`${token} Mine`);
    expect(titles).not.toContain(`${token} Theirs`);
  });

  it("still shows everything to a rep who has the capability", async () => {
    const hits = await quickSearch(asRep(openId), token);
    const titles = hits.map((h) => h.title);
    expect(titles).toContain(`${token} Mine`);
    expect(titles).toContain(`${token} Theirs`);
  });
});

describe("team numbers", () => {
  it("returns null for a rep without the capability", async () => {
    expect(await getOwnerBreakdown(asRep(restrictedId))).toBeNull();
  });

  it("returns data for a rep with it, and for admins", async () => {
    expect(await getOwnerBreakdown(asRep(openId))).not.toBeNull();
    expect(await getOwnerBreakdown(admin)).not.toBeNull();
  });
});

describe("assigning a set takes effect", () => {
  it("changes what a rep can do", async () => {
    await db.user.update({ where: { id: otherRepId }, data: { permissionSetId: restrictedSetId } });
    expect((await getCapabilities(asRep(otherRepId))).canSeeAllMerchants).toBe(false);

    await db.user.update({ where: { id: otherRepId }, data: { permissionSetId: null } });
    expect((await getCapabilities(asRep(otherRepId))).canSeeAllMerchants).toBe(true);
  });
});
