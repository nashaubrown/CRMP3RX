import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { createMerchant } from "@/services/merchants";
import {
  addCuratedReward,
  archiveRewardTemplate,
  createRewardTemplate,
  deleteCuratedReward,
  listCuratedRewards,
  listRewardTemplates,
  RewardError,
  setCuratedRewardStatus,
  updateRewardTemplate,
} from "@/services/rewards";

const suffix = `rwd-${Math.random().toString(36).slice(2, 8)}`;
let admin: SessionUser;
let owner: SessionUser; // rep who owns the merchant
let outsider: SessionUser; // rep with no tie to the merchant
let merchantId: string;

beforeAll(async () => {
  const [a, o, x] = await Promise.all([
    db.user.create({ data: { name: "Rwd Admin", email: `admin-${suffix}@t.mv`, role: "ADMIN" } }),
    db.user.create({ data: { name: "Rwd Owner", email: `owner-${suffix}@t.mv`, role: "SALES_REP" } }),
    db.user.create({ data: { name: "Rwd Other", email: `other-${suffix}@t.mv`, role: "SALES_REP" } }),
  ]);
  admin = { id: a.id, role: "ADMIN", name: a.name };
  owner = { id: o.id, role: "SALES_REP", name: o.name };
  outsider = { id: x.id, role: "SALES_REP", name: x.name };

  const m = await db.merchant.create({
    data: { name: `Café ${suffix}`, ownerId: o.id, category: "Restaurants & Cafés" },
  });
  merchantId = m.id;
});

afterAll(async () => {
  await db.curatedReward.deleteMany({ where: { merchant: { name: { contains: suffix } } } });
  await db.rewardTemplate.deleteMany({ where: { title: { contains: suffix } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [admin.id, owner.id, outsider.id] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("reward library", () => {
  it("admins manage templates; reps cannot", async () => {
    const t = await createRewardTemplate(admin, {
      title: `Buy 5 get 1 ${suffix}`,
      description: "Sixth coffee free",
      mechanic: "STAMP_CARD",
      category: "Restaurants & Cafés",
    });
    expect(t.id).toBeTruthy();

    await expect(
      createRewardTemplate(owner, { title: `Nope ${suffix}`, mechanic: "DISCOUNT" })
    ).rejects.toThrow(RewardError);
  });

  it("archiving hides from the default list but keeps the row", async () => {
    const t = await createRewardTemplate(admin, {
      title: `Retired idea ${suffix}`,
      mechanic: "DISCOUNT",
    });
    await archiveRewardTemplate(admin, t.id, true);

    const active = await listRewardTemplates();
    expect(active.some((x) => x.id === t.id)).toBe(false);
    const all = await listRewardTemplates({ includeArchived: true });
    expect(all.some((x) => x.id === t.id)).toBe(true);
  });
});

describe("curated rewards", () => {
  it("curating from a template copies its wording at that moment", async () => {
    const t = await createRewardTemplate(admin, {
      title: `Happy hour ${suffix}`,
      description: "Original wording",
      mechanic: "TIME_LIMITED",
    });
    const r = await addCuratedReward(owner, merchantId, { templateId: t.id, title: "" });
    expect(r.title).toBe(`Happy hour ${suffix}`);
    expect(r.description).toBe("Original wording");
    expect(r.mechanic).toBe("TIME_LIMITED");

    // Editing the library later must not rewrite what was already curated.
    await updateRewardTemplate(admin, t.id, {
      title: `Happy hour v2 ${suffix}`,
      description: "Rewritten",
      mechanic: "TIME_LIMITED",
    });
    const after = await db.curatedReward.findUnique({ where: { id: r.id } });
    expect(after?.title).toBe(`Happy hour ${suffix}`);
    expect(after?.description).toBe("Original wording");
  });

  it("status workflow records the merchant's answer", async () => {
    const r = await addCuratedReward(owner, merchantId, {
      title: `10% off second visit ${suffix}`,
      mechanic: "DISCOUNT",
    });
    expect(r.status).toBe("IDEA");
    await setCuratedRewardStatus(owner, r.id, "PITCHED");
    const done = await setCuratedRewardStatus(owner, r.id, "ACCEPTED");
    expect(done.status).toBe("ACCEPTED");
  });

  it("follows the org's merchant edit model: any rep can curate, restricted reps can't see", async () => {
    // House rule (merchant-access.ts): EDIT is any signed-in user — the team
    // covers for each other. Curated rewards follow the merchant exactly.
    const r = await addCuratedReward(outsider, merchantId, {
      title: `Colleague's idea ${suffix}`,
      mechanic: "DISCOUNT",
    });
    expect(r.id).toBeTruthy();
    await deleteCuratedReward(outsider, r.id);

    // Visibility also follows the merchant: an "own book only" rep can't see
    // this merchant, so its curated rewards come back empty for them.
    const set = await db.permissionSet.create({
      data: { name: `Own book ${suffix}`, canSeeAllMerchants: false },
    });
    await db.user.update({ where: { id: outsider.id }, data: { permissionSetId: set.id } });
    try {
      expect(await listCuratedRewards(outsider, merchantId)).toEqual([]);
      expect((await listCuratedRewards(owner, merchantId)).length).toBeGreaterThan(0);
    } finally {
      await db.user.update({ where: { id: outsider.id }, data: { permissionSetId: null } });
      await db.permissionSet.delete({ where: { id: set.id } });
    }
  });

  it("a brand-new merchant opens with the starter shortlist: 5+ ideas, every mechanic", async () => {
    const m = await createMerchant(owner, {
      name: `Fresh Café ${suffix}`,
      category: "Restaurants & Cafés",
      status: "PROSPECT" as const,
      loyaltyLive: false,
      beta: false,
      phone: undefined,
      monthlyTxnVolume: undefined,
      branches: undefined,
      latitude: undefined,
      longitude: undefined,
    });
    const rewards = await listCuratedRewards(owner, m.id);
    expect(rewards.length).toBeGreaterThanOrEqual(5);
    expect(new Set(rewards.map((r) => r.mechanic))).toEqual(
      new Set(["STAMP_CARD", "DISCOUNT", "FREE_ITEM", "TIME_LIMITED"])
    );
    // Its own category's set wins over the evergreens.
    expect(rewards.some((r) => r.title === "Buy 5 coffees, get the 6th free")).toBe(true);
  });

  it("a merchant with an unknown category still gets 5 ideas, from the evergreens", async () => {
    const m = await createMerchant(owner, {
      name: `Odd Trade ${suffix}`,
      category: "Submarine Repairs",
      status: "PROSPECT" as const,
      loyaltyLive: false,
      beta: false,
      phone: undefined,
      monthlyTxnVolume: undefined,
      branches: undefined,
      latitude: undefined,
      longitude: undefined,
    });
    const rewards = await listCuratedRewards(owner, m.id);
    expect(rewards.length).toBeGreaterThanOrEqual(5);
    expect(new Set(rewards.map((r) => r.mechanic)).size).toBe(4);
  });

  it("deleting a curated reward removes only that row", async () => {
    const r = await addCuratedReward(owner, merchantId, {
      title: `Free dessert ${suffix}`,
      mechanic: "FREE_ITEM",
    });
    const before = (await listCuratedRewards(owner, merchantId)).length;
    await deleteCuratedReward(owner, r.id);
    const after = (await listCuratedRewards(owner, merchantId)).length;
    expect(after).toBe(before - 1);
  });
});
