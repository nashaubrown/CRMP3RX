import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { executeAssistantTool } from "@/services/assistant-tools";

// The list_merchants tool answers "how many prospects does X own" correctly —
// the gap that made the assistant guess/confuse merchant statuses with deal
// stages.

const suffix = `am-${Math.random().toString(36).slice(2, 8)}`;
let hizaamId: string;
let sahaafId: string;
let ctx: SessionUser;

beforeAll(async () => {
  const hizaam = await db.user.create({
    data: { name: `Hizaam ${suffix}`, email: `hizaam-${suffix}@test.mv`, role: "SALES_REP" },
  });
  const sahaaf = await db.user.create({
    data: { name: `Sahaaf ${suffix}`, email: `sahaaf-${suffix}@test.mv`, role: "SALES_REP" },
  });
  hizaamId = hizaam.id;
  sahaafId = sahaaf.id;
  ctx = { id: hizaam.id, name: hizaam.name, email: hizaam.email, role: "SALES_REP" } as SessionUser;

  // Hizaam: 3 prospects + 1 active. Sahaaf: 2 prospects.
  await db.merchant.createMany({
    data: [
      { name: `H Prospect A ${suffix}`, ownerId: hizaamId, status: "PROSPECT" },
      { name: `H Prospect B ${suffix}`, ownerId: hizaamId, status: "PROSPECT" },
      { name: `H Prospect C ${suffix}`, ownerId: hizaamId, status: "PROSPECT" },
      { name: `H Active D ${suffix}`, ownerId: hizaamId, status: "ACTIVE" },
      { name: `S Prospect E ${suffix}`, ownerId: sahaafId, status: "PROSPECT" },
      { name: `S Prospect F ${suffix}`, ownerId: sahaafId, status: "PROSPECT" },
    ],
  });
});

afterAll(async () => {
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.user.deleteMany({ where: { id: { in: [hizaamId, sahaafId] } } });
});

describe("list_merchants tool", () => {
  it("counts prospects owned by a named person", async () => {
    const raw = await executeAssistantTool(ctx, "list_merchants", {
      status: "PROSPECT",
      owner_name: `Hizaam ${suffix}`,
    });
    const res = JSON.parse(raw);
    expect(res.count).toBe(3);
    expect(res.by_owner[`Hizaam ${suffix}`]).toBe(3);
  });

  it("counts prospects for another owner independently", async () => {
    const raw = await executeAssistantTool(ctx, "list_merchants", {
      status: "PROSPECT",
      owner_name: `Sahaaf ${suffix}`,
    });
    const res = JSON.parse(raw);
    expect(res.count).toBe(2);
  });

  it("does not count active merchants as prospects", async () => {
    const raw = await executeAssistantTool(ctx, "list_merchants", {
      status: "ACTIVE",
      owner_name: `Hizaam ${suffix}`,
    });
    const res = JSON.parse(raw);
    expect(res.count).toBe(1);
  });
});
