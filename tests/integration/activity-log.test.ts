import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import {
  ActivityLogError,
  getUserActivitySummary,
  listActivityLog,
} from "@/services/activity-log";
import { audit } from "@/services/audit";

// Admin view over the audit trail, plus per-person adoption. audit() also
// stamps lastActiveAt, which is what makes "who is actually using this"
// answerable given sessions are JWT and nothing is written to Session.

const suffix = `al-${Math.random().toString(36).slice(2, 8)}`;
let adminId: string;
let repId: string;
const asAdmin = (): SessionUser => ({ id: adminId, role: "ADMIN", name: "A", email: "a@t.mv" });
const asRep = (): SessionUser => ({ id: repId, role: "SALES_REP", name: "R", email: "r@t.mv" });

beforeAll(async () => {
  const [a, r] = await Promise.all([
    db.user.create({ data: { name: `Admin ${suffix}`, email: `a-${suffix}@t.mv`, role: "ADMIN" } }),
    db.user.create({ data: { name: `Rep ${suffix}`, email: `r-${suffix}@t.mv`, role: "SALES_REP" } }),
  ]);
  adminId = a.id;
  repId = r.id;

  await audit({
    actorId: repId,
    action: "merchant.create",
    entityType: "MERCHANT",
    entityId: `m-${suffix}`,
  });
  await audit({
    actorId: repId,
    action: "export.merchants",
    entityType: "EXPORT",
    entityId: "merchants",
    diff: { rows: 141 },
  });
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: { in: [adminId, repId] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
});

describe("activity log", () => {
  it("is admin-only", async () => {
    await expect(listActivityLog(asRep())).rejects.toBeInstanceOf(ActivityLogError);
    await expect(getUserActivitySummary(asRep())).rejects.toBeInstanceOf(ActivityLogError);
  });

  it("returns entries newest first", async () => {
    const { items } = await listActivityLog(asAdmin(), { actorId: repId });
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].createdAt.getTime()).toBeGreaterThanOrEqual(items[1].createdAt.getTime());
  });

  it("filters by person", async () => {
    const { items } = await listActivityLog(asAdmin(), { actorId: repId });
    expect(items.every((i) => i.actorId === repId)).toBe(true);
  });

  it("filters by action prefix", async () => {
    const { items } = await listActivityLog(asAdmin(), { actorId: repId, action: "export" });
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe("export.merchants");
  });

  it("records the export, including the row count", async () => {
    const { items } = await listActivityLog(asAdmin(), { actorId: repId, action: "export" });
    expect((items[0].diff as { rows?: number })?.rows).toBe(141);
  });
});

describe("user activity summary", () => {
  it("counts each person's recent actions", async () => {
    const rows = await getUserActivitySummary(asAdmin());
    const rep = rows.find((r) => r.userId === repId);
    expect(rep).toBeDefined();
    expect(rep!.actionsLast7Days).toBeGreaterThanOrEqual(2);
    expect(rep!.actionsLast30Days).toBeGreaterThanOrEqual(2);
  });

  it("stamps lastActiveAt from the audited write", async () => {
    const rep = await db.user.findUnique({ where: { id: repId } });
    expect(rep?.lastActiveAt).not.toBeNull();
  });

  it("shows no sign-in for someone who never logged in", async () => {
    const rows = await getUserActivitySummary(asAdmin());
    const admin = rows.find((r) => r.userId === adminId);
    // lastLoginAt is only set by the Auth.js signIn event.
    expect(admin?.lastLoginAt).toBeNull();
    expect(admin?.actionsLast7Days).toBe(0);
  });
});

describe("presence (last seen)", () => {
  it("falls back to activity evidence when sign-in predates tracking", async () => {
    // The rep has audit activity (stamped lastActiveAt) but no lastLoginAt —
    // exactly the long-lived-session case. "never" would be a lie.
    await db.user.update({ where: { id: repId }, data: { lastLoginAt: null, lastSeenAt: null } });
    const summary = await getUserActivitySummary(asAdmin());
    const rep = summary.find((u) => u.userId === repId)!;
    expect(rep.lastLoginAt).toBeNull();
    expect(rep.signInPredatesTracking).toBe(true);
    expect(rep.lastSeenAt).not.toBeNull(); // floored to lastActiveAt
  });

  it("prefers the newest of seen/login/active for last seen", async () => {
    const now = new Date();
    const older = new Date(now.getTime() - 60 * 60 * 1000);
    await db.user.update({
      where: { id: repId },
      data: { lastLoginAt: older, lastSeenAt: now },
    });
    const summary = await getUserActivitySummary(asAdmin());
    const rep = summary.find((u) => u.userId === repId)!;
    expect(rep.lastSeenAt?.getTime()).toBe(now.getTime());
    expect(rep.signInPredatesTracking).toBe(false);
  });

  it("a user with no evidence at all still shows nothing", async () => {
    const ghost = await db.user.create({
      data: { name: `Ghost ${suffix}`, email: `g-${suffix}@t.mv`, role: "SALES_REP" },
    });
    const summary = await getUserActivitySummary(asAdmin());
    const g = summary.find((u) => u.userId === ghost.id)!;
    expect(g.lastSeenAt).toBeNull();
    expect(g.signInPredatesTracking).toBe(false);
  });
});
