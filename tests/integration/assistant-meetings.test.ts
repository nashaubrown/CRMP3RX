import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { executeAssistantTool } from "@/services/assistant-tools";

// list_meetings surfaces FUTURE meetings — the gap that made Ask Perx answer
// "no upcoming meetings" while one existed on the Meetings page.

const suffix = `amt-${Math.random().toString(36).slice(2, 8)}`;
let hostId: string;
let ctx: SessionUser;

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: `Host ${suffix}`, email: `host-${suffix}@test.mv`, role: "SALES_REP" },
  });
  hostId = host.id;
  ctx = { id: host.id, role: "SALES_REP", name: host.name, email: host.email };

  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days out
  await db.meeting.create({
    data: {
      hostUserId: hostId,
      title: "Intro with Azraq",
      bookerName: "Azraq",
      bookerEmail: "",
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60 * 1000),
    },
  });
});

afterAll(async () => {
  await db.meeting.deleteMany({ where: { hostUserId: hostId } });
  await db.user.deleteMany({ where: { id: hostId } });
});

describe("list_meetings tool", () => {
  it("returns an upcoming meeting several days out", async () => {
    const res = JSON.parse(await executeAssistantTool(ctx, "list_meetings", { scope: "mine" }));
    expect(res.count).toBeGreaterThanOrEqual(1);
    expect(res.next?.with).toBe("Azraq");
  });
});
