import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SessionUser } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  clearEmailSettings,
  resolveEmailFrom,
  saveEmailSettings,
} from "@/services/email-settings";

const suffix = `emailid-${Math.random().toString(36).slice(2, 8)}`;
let admin: SessionUser;

beforeAll(async () => {
  const user = await db.user.create({
    data: { name: `Admin ${suffix}`, email: `admin-${suffix}@test.mv`, role: "ADMIN" },
  });
  admin = { id: user.id, role: "ADMIN", name: user.name, email: user.email };
});

afterAll(async () => {
  await db.emailSetting.deleteMany({ where: { id: "singleton" } });
  await db.auditLog.deleteMany({ where: { actorId: admin.id } });
  await db.user.deleteMany({ where: { id: admin.id } });
});

describe("email sender identity", () => {
  it("composes 'Name <email>' from the saved singleton", async () => {
    await saveEmailSettings(admin, { fromName: "Perx Sales", fromEmail: "sales@perx.mv" });
    expect(await resolveEmailFrom()).toBe("Perx Sales <sales@perx.mv>");
  });

  it("uses the bare address when no name is set", async () => {
    await saveEmailSettings(admin, { fromEmail: "noreply@perx.mv" });
    expect(await resolveEmailFrom()).toBe("noreply@perx.mv");
  });

  it("falls back to the env/default after clearing", async () => {
    await clearEmailSettings(admin);
    const from = await resolveEmailFrom();
    expect(from).toBeTruthy();
    expect(from).not.toBe("noreply@perx.mv");
  });

  it("rejects a non-admin", async () => {
    const rep: SessionUser = { id: "x", role: "SALES_REP", name: "Rep", email: "r@test.mv" };
    await expect(saveEmailSettings(rep, { fromEmail: "x@perx.mv" })).rejects.toThrow();
  });
});
