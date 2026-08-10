import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import type { AiProvider, AiStreamEvent } from "@/integrations/ai/types";
import { generateAiRewards } from "@/services/reward-ai";
import { listCuratedRewards, RewardError, setCuratedRewardStatus } from "@/services/rewards";

const suffix = `rwai-${Math.random().toString(36).slice(2, 8)}`;
let owner: SessionUser;
let merchantId: string;

// A provider that always proposes the same valid five, tagged so we can
// recognise them. Exercises the real parse/replace path with zero network.
function stubProvider(marker: string): AiProvider {
  return {
    label: "stub",
    async *streamTurn(): AsyncGenerator<AiStreamEvent> {
      yield {
        type: "final",
        text: "",
        toolCalls: [
          {
            id: "call-1",
            name: "propose_rewards",
            input: {
              rewards: [
                { title: `${marker} stamp`, mechanic: "STAMP_CARD" },
                { title: `${marker} discount`, mechanic: "DISCOUNT" },
                { title: `${marker} free`, mechanic: "FREE_ITEM" },
                { title: `${marker} timed`, mechanic: "TIME_LIMITED" },
                { title: `${marker} extra`, mechanic: "DISCOUNT" },
              ],
            },
          },
        ],
      };
    },
  };
}

// A provider that never calls the tool — the failure path.
const uselessProvider: AiProvider = {
  label: "useless",
  async *streamTurn(): AsyncGenerator<AiStreamEvent> {
    yield { type: "final", text: "Here are some ideas: ...", toolCalls: [] };
  },
};

beforeAll(async () => {
  const o = await db.user.create({
    data: { name: "RwAI Owner", email: `owner-${suffix}@t.mv`, role: "SALES_REP" },
  });
  owner = { id: o.id, role: "SALES_REP", name: o.name };
  const m = await db.merchant.create({
    data: { name: `Harbour Café ${suffix}`, ownerId: o.id, category: "Restaurants & Cafés" },
  });
  merchantId = m.id;
  // Give it the starter set the backfill/auto-curation would have left.
  const templates = await db.rewardTemplate.findMany({
    where: { category: "Restaurants & Cafés", archived: false },
    take: 5,
  });
  await db.curatedReward.createMany({
    data: templates.map((t) => ({
      merchantId: m.id,
      templateId: t.id,
      title: t.title,
      description: t.description,
      mechanic: t.mechanic,
      source: "STARTER" as const,
      createdById: o.id,
    })),
  });
});

afterAll(async () => {
  await db.merchant.deleteMany({ where: { name: { contains: suffix } } });
  await db.auditLog.deleteMany({ where: { actorId: owner.id } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("AI-written rewards", () => {
  it("replaces untouched starters but keeps anything a rep has moved or edited", async () => {
    // Touch one starter: pitch it. It must survive the AI refresh.
    const before = await listCuratedRewards(owner, merchantId);
    const kept = before.find((r) => r.source === "STARTER")!;
    await setCuratedRewardStatus(owner, kept.id, "PITCHED");

    const res = await generateAiRewards(owner, merchantId, stubProvider("v1"));
    expect(res.written).toBe(5);
    expect(res.replaced).toBe(before.length - 1); // all starters except the pitched one

    const after = await listCuratedRewards(owner, merchantId);
    expect(after.some((r) => r.id === kept.id)).toBe(true); // pitched one survived
    expect(after.filter((r) => r.source === "AI")).toHaveLength(5);
    // The rule still holds: 5+ ideas, all four mechanics.
    expect(after.length).toBeGreaterThanOrEqual(5);
    expect(new Set(after.map((r) => r.mechanic)).size).toBe(4);
  });

  it("a second run replaces its own untouched output instead of accumulating", async () => {
    const before = await listCuratedRewards(owner, merchantId);
    await generateAiRewards(owner, merchantId, stubProvider("v2"));
    const after = await listCuratedRewards(owner, merchantId);
    expect(after.length).toBe(before.length); // swapped, not stacked
    expect(after.some((r) => r.title.startsWith("v2 "))).toBe(true);
    expect(after.some((r) => r.title.startsWith("v1 "))).toBe(false);
  });

  it("fails cleanly when the model never proposes", async () => {
    await expect(generateAiRewards(owner, merchantId, uselessProvider)).rejects.toThrow(
      RewardError
    );
    // And leaves the existing shortlist untouched.
    const after = await listCuratedRewards(owner, merchantId);
    expect(after.length).toBeGreaterThanOrEqual(5);
  });
});
