import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { contactSchema } from "@/lib/validators/contact";
import { merchantSchema } from "@/lib/validators/merchant";
import { createContact } from "@/services/contacts";
import { createMerchant } from "@/services/merchants";
import { getBotOwner } from "@/services/telegram";

// The bot creates merchants/contacts as a shared "Sales" admin account: records
// are owned by Sales, and (being admin) it can attach a contact to any merchant.

const suffix = `tgr-${Math.random().toString(36).slice(2, 8)}`;
let repId: string;
let repMerchantId: string;
const createdMerchantIds: string[] = [];
const createdContactIds: string[] = [];

beforeAll(async () => {
  const rep = await db.user.create({
    data: { name: `Rep ${suffix}`, email: `rep-${suffix}@test.mv`, role: "SALES_REP" },
  });
  repId = rep.id;
  const m = await db.merchant.create({
    data: { name: `Rep Merchant ${suffix}`, ownerId: repId, status: "PROSPECT" },
  });
  repMerchantId = m.id;
});

afterAll(async () => {
  await db.contact.deleteMany({ where: { id: { in: createdContactIds } } });
  await db.merchant.deleteMany({ where: { id: { in: [repMerchantId, ...createdMerchantIds] } } });
  await db.user.deleteMany({ where: { id: repId } });
  // Remove the on-demand Sales account this test created.
  await db.user.deleteMany({ where: { email: "sales@perx.local" } });
});

describe("Telegram record creation", () => {
  it("getBotOwner returns a Sales admin account", async () => {
    const owner = await getBotOwner();
    expect(owner.name).toBe("Sales");
    expect(owner.role).toBe("ADMIN");
  });

  it("creates a merchant owned by Sales", async () => {
    const owner = await getBotOwner();
    const input = merchantSchema.parse({ name: `Bot Merchant ${suffix}`, status: "PROSPECT" });
    const merchant = await createMerchant(owner, input);
    createdMerchantIds.push(merchant.id);
    expect(merchant.ownerId).toBe(owner.id);
  });

  it("attaches a contact to another rep's merchant (admin) owned by Sales", async () => {
    const owner = await getBotOwner();
    const input = contactSchema.parse({
      firstName: "Ali",
      lastName: `Rasheed ${suffix}`,
      merchantIds: [repMerchantId],
    });
    const contact = await createContact(owner, input);
    createdContactIds.push(contact.id);
    expect(contact.merchantId).toBe(repMerchantId);
    expect(contact.ownerId).toBe(owner.id);
  });
});
