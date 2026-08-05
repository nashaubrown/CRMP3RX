import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { quickSearch } from "@/services/search";

// Backs the ⌘K palette: one query across merchants, contacts, deals and leads.

const suffix = `qs-${Math.random().toString(36).slice(2, 8)}`;
const token = `Zeeqx${suffix.slice(-4)}`; // distinctive, so results are unambiguous
let userId: string;
let merchantId: string;
let ctx: SessionUser;

beforeAll(async () => {
  const user = await db.user.create({
    data: { name: "Searcher", email: `s-${suffix}@test.mv`, role: "SALES_REP" },
  });
  userId = user.id;
  ctx = { id: user.id, role: "SALES_REP", name: user.name, email: user.email };

  const merchant = await db.merchant.create({
    data: { name: `${token} Cafe`, ownerId: userId, category: "Restaurants" },
  });
  merchantId = merchant.id;

  await db.contact.create({
    data: { firstName: token, lastName: "Waheed", merchantId, ownerId: userId },
  });
  await db.deal.create({
    data: { title: `${token} rollout`, merchantId, ownerId: userId, value: 5000 },
  });
  await db.lead.create({
    data: { source: "WEB", name: `${token} enquiry`, company: "Somewhere" },
  });
});

afterAll(async () => {
  await db.lead.deleteMany({ where: { name: { contains: token } } });
  await db.deal.deleteMany({ where: { merchantId } });
  await db.contact.deleteMany({ where: { merchantId } });
  await db.merchant.deleteMany({ where: { id: merchantId } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe("quickSearch", () => {
  it("finds all four record types from one query", async () => {
    const hits = await quickSearch(ctx, token);
    const types = new Set(hits.map((h) => h.type));
    expect(types).toContain("MERCHANT");
    expect(types).toContain("CONTACT");
    expect(types).toContain("DEAL");
    expect(types).toContain("LEAD");
  });

  it("returns a usable href for each hit", async () => {
    const hits = await quickSearch(ctx, token);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.href).toMatch(/^\/(merchants|contacts|deals|leads)\/.+/);
      expect(hit.title.trim()).not.toBe("");
    }
  });

  it("is case-insensitive", async () => {
    const lower = await quickSearch(ctx, token.toLowerCase());
    expect(lower.some((h) => h.type === "MERCHANT")).toBe(true);
  });

  it("ignores queries shorter than two characters", async () => {
    // A single character matches most of the table and helps nobody.
    expect(await quickSearch(ctx, "a")).toEqual([]);
    expect(await quickSearch(ctx, " ")).toEqual([]);
    expect(await quickSearch(ctx, "")).toEqual([]);
  });

  it("returns nothing for a term that matches no record", async () => {
    expect(await quickSearch(ctx, "zzzz-no-such-record-zzzz")).toEqual([]);
  });

  it("finds a merchant by its contact's search too, without duplicating it", async () => {
    const hits = await quickSearch(ctx, `${token} Cafe`);
    const merchants = hits.filter((h) => h.type === "MERCHANT");
    expect(merchants).toHaveLength(1);
    expect(merchants[0].href).toBe(`/merchants/${merchantId}`);
  });
});
