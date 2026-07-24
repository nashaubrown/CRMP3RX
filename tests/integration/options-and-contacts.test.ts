import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { createContact, updateContact } from "@/services/contacts";
import { getMerchant } from "@/services/merchants";
import {
  addOption,
  listManagedOptions,
  listOptions,
  OptionSetError,
  renameOption,
  setOptionArchived,
} from "@/services/option-sets";

const suffix = `optct-${Math.random().toString(36).slice(2, 8)}`;

let admin: SessionUser;
let rep: SessionUser;
let merchantA: string;
let merchantB: string;

beforeAll(async () => {
  const [adminUser, repUser] = await Promise.all([
    db.user.create({ data: { name: "Opt Admin", email: `admin-${suffix}@t.mv`, role: "ADMIN" } }),
    db.user.create({ data: { name: "Opt Rep", email: `rep-${suffix}@t.mv`, role: "SALES_REP" } }),
  ]);
  admin = { id: adminUser.id, role: "ADMIN", name: adminUser.name };
  rep = { id: repUser.id, role: "SALES_REP", name: repUser.name };

  const [a, b] = await Promise.all([
    db.merchant.create({ data: { name: `A ${suffix}`, ownerId: repUser.id } }),
    db.merchant.create({ data: { name: `B ${suffix}`, ownerId: repUser.id } }),
  ]);
  merchantA = a.id;
  merchantB = b.id;
});

afterAll(async () => {
  await db.contact.deleteMany({ where: { firstName: { contains: suffix } } });
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.optionItem.deleteMany({ where: { label: { contains: suffix } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [admin.id, rep.id] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("option sets", () => {
  it("only admins can mutate", async () => {
    await expect(addOption(rep, "MERCHANT_CATEGORY", `X ${suffix}`)).rejects.toThrow(OptionSetError);
  });

  it("admin can add, rename, and archive; listOptions reflects active + includeValue", async () => {
    await addOption(admin, "MERCHANT_CATEGORY", `Cat ${suffix}`);
    let active = await listOptions("MERCHANT_CATEGORY");
    expect(active).toContain(`Cat ${suffix}`);

    const managed = await listManagedOptions(admin, "MERCHANT_CATEGORY");
    const item = managed.find((m) => m.label === `Cat ${suffix}`)!;
    await renameOption(admin, item.id, `Cat2 ${suffix}`);

    await setOptionArchived(admin, item.id, true);
    active = await listOptions("MERCHANT_CATEGORY");
    expect(active).not.toContain(`Cat2 ${suffix}`);

    // Archived value stays available when it's the currently-stored value.
    const withValue = await listOptions("MERCHANT_CATEGORY", `Cat2 ${suffix}`);
    expect(withValue).toContain(`Cat2 ${suffix}`);
  });

  it("rejects duplicate labels", async () => {
    await addOption(admin, "SUBSCRIPTION_PLAN", `Plan ${suffix}`);
    await expect(addOption(admin, "SUBSCRIPTION_PLAN", `Plan ${suffix}`)).rejects.toThrow(/already exists/);
  });
});

describe("multi-merchant contacts", () => {
  it("creates a contact tagged to multiple merchants; home = first", async () => {
    const contact = await createContact(rep, {
      firstName: `Multi${suffix}`,
      lastName: "Person",
      title: undefined,
      email: undefined,
      phone: undefined,
      merchantIds: [merchantA, merchantB],
      isPrimary: true,
    });
    expect(contact.merchantId).toBe(merchantA);

    const links = await db.contactMerchant.findMany({ where: { contactId: contact.id } });
    expect(links.map((l) => l.merchantId).sort()).toEqual([merchantA, merchantB].sort());
  });

  it("shows the contact on every tagged merchant's page", async () => {
    const a = await getMerchant(rep, merchantA);
    const b = await getMerchant(rep, merchantB);
    expect(a!.contacts.some((c) => c.firstName === `Multi${suffix}`)).toBe(true);
    expect(b!.contacts.some((c) => c.firstName === `Multi${suffix}`)).toBe(true);
  });

  it("update syncs the tag set (removing one drops it from that merchant)", async () => {
    const existing = await db.contact.findFirst({ where: { firstName: `Multi${suffix}` } });
    await updateContact(rep, existing!.id, {
      firstName: `Multi${suffix}`,
      lastName: "Person",
      title: undefined,
      email: undefined,
      phone: undefined,
      merchantIds: [merchantB], // drop A, keep B
      isPrimary: true,
    });

    const links = await db.contactMerchant.findMany({ where: { contactId: existing!.id } });
    expect(links.map((l) => l.merchantId)).toEqual([merchantB]);

    const a = await getMerchant(rep, merchantA);
    expect(a!.contacts.some((c) => c.firstName === `Multi${suffix}`)).toBe(false);
  });
});
