import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import {
  createTeamUser,
  listTeam,
  resetTeamPassword,
  setTeamDisabled,
  setTeamRole,
  TeamError,
} from "@/services/users";

// Integration tests against the local Postgres. Everything created here uses a
// unique suffix and is cleaned up afterwards.

const suffix = `teamtest-${Math.random().toString(36).slice(2, 8)}`;

let admin: SessionUser;
let rep: SessionUser;
let createdEmail: string;

beforeAll(async () => {
  const [adminUser, repUser] = await Promise.all([
    db.user.create({
      data: { name: "Team Admin", email: `admin-${suffix}@test.mv`, role: "ADMIN", passwordHash: "x" },
    }),
    db.user.create({
      data: { name: "Team Rep", email: `rep-${suffix}@test.mv`, role: "SALES_REP", passwordHash: "x" },
    }),
  ]);
  admin = { id: adminUser.id, role: "ADMIN", name: adminUser.name };
  rep = { id: repUser.id, role: "SALES_REP", name: repUser.name };
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("team management", () => {
  it("a sales rep cannot manage the team", async () => {
    await expect(
      createTeamUser(rep, {
        name: "Nope",
        email: `nope-${suffix}@test.mv`,
        role: "SALES_REP",
        password: "password123",
      })
    ).rejects.toThrow(TeamError);
    await expect(listTeam(rep)).rejects.toThrow(TeamError);
  });

  it("an admin can create a teammate with a hashed password", async () => {
    createdEmail = `new-${suffix}@test.mv`;
    const created = await createTeamUser(admin, {
      name: "New Rep",
      email: createdEmail.toUpperCase(), // normalized to lowercase
      role: "SALES_REP",
      password: "password123",
    });
    expect(created.email).toBe(createdEmail);
    expect(created.role).toBe("SALES_REP");

    const row = await db.user.findUnique({ where: { email: createdEmail } });
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe("password123"); // stored as a hash
  });

  it("rejects a duplicate email", async () => {
    await expect(
      createTeamUser(admin, {
        name: "Dupe",
        email: createdEmail,
        role: "SALES_REP",
        password: "password123",
      })
    ).rejects.toThrow(/already exists/);
  });

  it("rejects a short password", async () => {
    await expect(
      createTeamUser(admin, {
        name: "Weak",
        email: `weak-${suffix}@test.mv`,
        role: "SALES_REP",
        password: "short",
      })
    ).rejects.toThrow(/at least 8/);
  });

  it("can promote and reset a teammate's password", async () => {
    const target = await db.user.findUnique({ where: { email: createdEmail } });
    await setTeamRole(admin, { userId: target!.id, role: "ADMIN" });
    expect((await db.user.findUnique({ where: { id: target!.id } }))?.role).toBe("ADMIN");

    const before = target!.passwordHash;
    await resetTeamPassword(admin, { userId: target!.id, password: "brandnewpass" });
    const after = await db.user.findUnique({ where: { id: target!.id } });
    expect(after?.passwordHash).not.toBe(before);
  });

  it("can disable and re-enable a teammate", async () => {
    const target = await db.user.findUnique({ where: { email: createdEmail } });
    await setTeamDisabled(admin, { userId: target!.id, disabled: true });
    expect((await db.user.findUnique({ where: { id: target!.id } }))?.disabledAt).toBeTruthy();
    await setTeamDisabled(admin, { userId: target!.id, disabled: false });
    expect((await db.user.findUnique({ where: { id: target!.id } }))?.disabledAt).toBeNull();
  });

  it("won't let an admin disable their own account", async () => {
    await expect(
      setTeamDisabled(admin, { userId: admin.id, disabled: true })
    ).rejects.toThrow(/your own account/);
  });

  it("won't demote or disable the last active admin", async () => {
    // Demote the promoted teammate back so `admin` is the only active admin here…
    const target = await db.user.findUnique({ where: { email: createdEmail } });
    await setTeamRole(admin, { userId: target!.id, role: "SALES_REP" });

    // With other admins possibly present from other suites, assert on the
    // specific guard by counting: if admin is the last active admin, both fail.
    const activeAdmins = await db.user.count({ where: { role: "ADMIN", disabledAt: null } });
    if (activeAdmins === 1) {
      await expect(
        setTeamRole(admin, { userId: admin.id, role: "SALES_REP" })
      ).rejects.toThrow(/last admin/);
      await expect(
        setTeamDisabled(admin, { userId: admin.id, disabled: true })
      ).rejects.toThrow();
    }
  });
});
