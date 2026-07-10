import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import {
  exportMerchantsCsv,
  importContactsCsv,
  importMerchantsCsv,
} from "@/services/csv";

// CSV import runs through the same services as the web forms: validation,
// duplicate skipping, merchant edit-rights gate, and audit logging.

const suffix = `csvt-${Math.random().toString(36).slice(2, 8)}`;
let ownerId: string;
let strangerId: string;

const owner = () => ({ id: ownerId, role: "SALES_REP" as const, name: "CSV Owner" });
const stranger = () => ({ id: strangerId, role: "SALES_REP" as const, name: "CSV Stranger" });

beforeAll(async () => {
  const [o, s] = await Promise.all([
    db.user.create({
      data: { name: "CSV Owner", email: `csvowner-${suffix}@test.mv`, role: "SALES_REP" },
    }),
    db.user.create({
      data: { name: "CSV Stranger", email: `csvstranger-${suffix}@test.mv`, role: "SALES_REP" },
    }),
  ]);
  ownerId = o.id;
  strangerId = s.id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: { in: [ownerId, strangerId] } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("merchant CSV import", () => {
  it("creates valid rows, skips duplicates, reports bad rows", async () => {
    const rows = [
      { name: `Alpha Cafe ${suffix}`, status: "ACTIVE", email: "alpha@x.mv", monthlytxnvolume: "500" },
      { name: `Beta Mart ${suffix}`, phone: "777 1234", loyaltylive: "yes" },
      { name: "", email: "noname@x.mv" }, // missing name
      { name: `Gamma ${suffix}`, email: "not-an-email" }, // invalid email
    ];
    const result = await importMerchantsCsv(owner(), rows);

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ row: 4 });
    expect(result.errors[1].message).toMatch(/email/i);

    const beta = await db.merchant.findFirst({ where: { name: `Beta Mart ${suffix}` } });
    expect(beta?.ownerId).toBe(ownerId);
    expect(beta?.phone).toBe("+9607771234"); // normalized to E.164
    expect(beta?.loyaltyLive).toBe(true);

    // Re-import of the same rows is a no-op (name dedupe)
    const again = await importMerchantsCsv(owner(), rows.slice(0, 2));
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(2);
  });

  it("round-trips its own export format", async () => {
    const csv = await exportMerchantsCsv(owner(), { q: `Alpha Cafe ${suffix}` });
    const records = parseCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe(`Alpha Cafe ${suffix}`);
    expect(records[0].email).toBe("alpha@x.mv");

    const result = await importMerchantsCsv(owner(), records);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe("contact CSV import", () => {
  it("resolves merchants by name, dedupes, and enforces edit rights", async () => {
    const merchantName = `Alpha Cafe ${suffix}`;
    const rows = [
      { firstname: "Aminath", lastname: "Waheeda", merchant: merchantName, email: `w-${suffix}@x.mv`, isprimary: "true" },
      { firstname: "Ibrahim", lastname: "Rasheed", merchant: "No Such Merchant XYZ" },
      { firstname: "NoLast", lastname: "", merchant: merchantName },
    ];

    const result = await importContactsCsv(owner(), rows);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/not found/);

    // Duplicate by email under the same merchant → skipped
    const again = await importContactsCsv(owner(), rows.slice(0, 1));
    expect(again.skipped).toBe(1);

    // A user without edit rights on the merchant can't import into it
    const denied = await importContactsCsv(stranger(), [
      { firstname: "Sneaky", lastname: "Import", merchant: merchantName },
    ]);
    expect(denied.created).toBe(0);
    expect(denied.errors[0].message).toMatch(/edit access|permission|not allowed/i);
  });
});
