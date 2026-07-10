import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { runCanvasAction } from "@/services/canvas";

// Inline actions from a generated view must go through the same RBAC/edit
// gates as the rest of the app: the model proposes, the server enforces.

const suffix = `cav-${Math.random().toString(36).slice(2, 8)}`;
let ownerId: string;
let strangerId: string;
let merchantId: string;

const owner = () => ({ id: ownerId, role: "SALES_REP" as const, name: "Canvas Owner" });
const stranger = () => ({ id: strangerId, role: "SALES_REP" as const, name: "No Access" });

beforeAll(async () => {
  const [o, s] = await Promise.all([
    db.user.create({ data: { name: "Canvas Owner", email: `cavowner-${suffix}@test.mv`, role: "SALES_REP" } }),
    db.user.create({ data: { name: "No Access", email: `cavstranger-${suffix}@test.mv`, role: "SALES_REP" } }),
  ]);
  ownerId = o.id;
  strangerId = s.id;
  const m = await db.merchant.create({ data: { name: `Canvas Merchant ${suffix}`, ownerId } });
  merchantId = m.id;
});

afterAll(async () => {
  await db.activity.deleteMany({ where: { ownerId: { in: [ownerId, strangerId] } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [ownerId, strangerId] } } });
  await db.merchant.deleteMany({ where: { id: merchantId } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("runCanvasAction", () => {
  it("logs an activity when the user can edit the record", async () => {
    const res = await runCanvasAction(owner(), {
      kind: "log_activity",
      label: "Log call",
      entityType: "MERCHANT",
      entityId: merchantId,
      activityType: "CALL",
      subject: "Discussed loyalty rollout",
    });
    expect(res.ok).toBe(true);

    const activity = await db.activity.findFirst({
      where: { entityType: "MERCHANT", entityId: merchantId, ownerId },
    });
    expect(activity?.type).toBe("CALL");
    expect(activity?.subject).toBe("Discussed loyalty rollout");
  });

  it("rejects a write action from a user without edit rights", async () => {
    await expect(
      runCanvasAction(stranger(), {
        kind: "log_activity",
        label: "Sneaky",
        entityType: "MERCHANT",
        entityId: merchantId,
        subject: "Should not persist",
      })
    ).rejects.toThrow(/edit access/i);

    const leaked = await db.activity.findFirst({
      where: { entityType: "MERCHANT", entityId: merchantId, ownerId: strangerId },
    });
    expect(leaked).toBeNull();
  });

  it("rejects a fabricated entity id", async () => {
    await expect(
      runCanvasAction(owner(), {
        kind: "log_activity",
        label: "x",
        entityType: "MERCHANT",
        entityId: "does-not-exist",
        subject: "x",
      })
    ).rejects.toThrow();
  });

  it("treats link actions as no-op navigation", async () => {
    const res = await runCanvasAction(owner(), {
      kind: "link",
      label: "Open",
      href: "/merchants/abc",
    });
    expect(res.ok).toBe(true);
  });

  it("rejects an invalid action shape", async () => {
    const res = await runCanvasAction(owner(), { kind: "drop_table", label: "x" });
    expect(res.ok).toBe(false);
  });
});
