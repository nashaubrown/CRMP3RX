import { afterAll, describe, expect, it } from "vitest";

import {
  AFFILIATE_CODE_ALPHABET,
  AFFILIATE_CODE_LENGTH,
  generateAffiliateCode,
  isValidAffiliateCode,
  normalizeAffiliateCode,
} from "@/lib/affiliate-code";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { createAffiliate, updateAffiliate } from "@/services/affiliates";

// Every affiliate carries a permanent 6-character referral code. It is issued
// once and must never change, because it gets printed, shared and quoted on
// payouts.

const suffix = `ac-${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];
const rep: SessionUser = { id: "", role: "SALES_REP", name: "Rep", email: `r-${suffix}@test.mv` };

afterAll(async () => {
  await db.affiliate.deleteMany({ where: { id: { in: created } } });
  await db.user.deleteMany({ where: { email: `r-${suffix}@test.mv` } });
});

describe("affiliate code generation", () => {
  it("is 6 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAffiliateCode();
      expect(code).toHaveLength(AFFILIATE_CODE_LENGTH);
      expect(isValidAffiliateCode(code)).toBe(true);
    }
  });

  it("excludes the characters that get misread", () => {
    for (const c of ["0", "O", "1", "I", "L", "U"]) {
      expect(AFFILIATE_CODE_ALPHABET).not.toContain(c);
    }
  });

  it("does not collide across a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateAffiliateCode());
    // 5000 draws from 729M: a collision here means the generator is broken.
    expect(seen.size).toBe(5000);
  });

  it("normalises case and separators but invents nothing", () => {
    expect(normalizeAffiliateCode(" k7x4p9 ")).toBe("K7X4P9");
    expect(normalizeAffiliateCode("K7X-4P9")).toBe("K7X4P9");
    // An excluded character has no counterpart, so it must stay invalid
    // rather than be silently rewritten into a different affiliate's code.
    expect(isValidAffiliateCode(normalizeAffiliateCode("K7X4PO"))).toBe(false);
  });
});

describe("affiliate code persistence", () => {
  it("assigns a code on creation and keeps it through an update", async () => {
    const user = await db.user.create({
      data: { name: "Rep", email: `r-${suffix}@test.mv`, role: "SALES_REP" },
    });
    rep.id = user.id;

    const made = await createAffiliate(rep, {
      name: `Partner ${suffix}`,
      commissionRate: 15,
      email: undefined,
      phone: undefined,
    });
    created.push(made.id);

    expect(isValidAffiliateCode(made.code)).toBe(true);

    await updateAffiliate(rep, made.id, {
      name: `Renamed ${suffix}`,
      commissionRate: 20,
      email: undefined,
      phone: undefined,
    });

    const after = await db.affiliate.findUnique({ where: { id: made.id } });
    expect(after?.name).toBe(`Renamed ${suffix}`);
    expect(after?.code).toBe(made.code); // unchanged
  });

  it("gives two affiliates different codes", async () => {
    const a = await createAffiliate(rep, {
      name: `One ${suffix}`,
      commissionRate: 5,
      email: undefined,
      phone: undefined,
    });
    const b = await createAffiliate(rep, {
      name: `Two ${suffix}`,
      commissionRate: 5,
      email: undefined,
      phone: undefined,
    });
    created.push(a.id, b.id);
    expect(a.code).not.toBe(b.code);
  });
});
