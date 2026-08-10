import { z } from "zod";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { pointInGeofence, toGeofence, type LatLng } from "@/lib/geo";
import { aiConfigHint, getAiProvider } from "@/integrations/ai";
import type { AiMessage, AiProvider } from "@/integrations/ai/types";
import { audit } from "@/services/audit";
import { assertMerchantEdit } from "@/services/merchant-access";
import { RewardError } from "@/services/rewards";

// Writes a reward shortlist for one specific merchant, from that merchant's
// own facts — name, notes, size, location. Rep-triggered from the merchant
// page ("Write with AI"), never automatic: each run is a visible, deliberate
// AI call with a small cost.
//
// Replacement rule: only untouched STARTER/AI ideas make way for the new set.
// "Untouched" means still at IDEA with updatedAt equal to createdAt — the
// moment a rep edits, pitches or gets an answer on an idea, it's theirs and
// no refresh will remove it. LIBRARY and CUSTOM ideas are never auto-removed.

const MECHANICS = ["STAMP_CARD", "DISCOUNT", "FREE_ITEM", "TIME_LIMITED"] as const;

const proposalSchema = z
  .object({
    rewards: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          description: z.string().trim().max(500).optional(),
          mechanic: z.enum(MECHANICS),
        })
      )
      .min(5, "Propose at least 5 rewards")
      .max(8),
  })
  .superRefine((val, ctx) => {
    const present = new Set(val.rewards.map((r) => r.mechanic));
    const missing = MECHANICS.filter((m) => !present.has(m));
    if (missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Every mechanic must appear at least once; missing: ${missing.join(", ")}`,
      });
    }
  });

const PROPOSE_TOOL = {
  name: "propose_rewards",
  description:
    "Submit the reward shortlist for this merchant. 5-8 rewards; every mechanic (STAMP_CARD, DISCOUNT, FREE_ITEM, TIME_LIMITED) must appear at least once.",
  inputSchema: {
    type: "object" as const,
    properties: {
      rewards: {
        type: "array",
        minItems: 5,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, merchant-voiced reward line" },
            description: {
              type: "string",
              description: "One sentence of customer-facing detail (optional)",
            },
            mechanic: { type: "string", enum: [...MECHANICS] },
          },
          required: ["title", "mechanic"],
        },
      },
    },
    required: ["rewards"],
  },
};

const SYSTEM = `You write loyalty reward ideas for merchants in the Maldives on the Perx loyalty platform. A sales rep will pitch these to the merchant, who then creates the chosen ones in their Merchant Portal.

Rules:
- Write for THIS merchant specifically — use its name, what it sells, its size and its setting. Ideas that could belong to any shop are failures.
- Prices are in MVR (Maldivian rufiyaa). Scale generosity to the merchant's transaction volume: a small kiosk cannot give away what a resort can.
- Only these mechanics exist: STAMP_CARD (collect N, get X), DISCOUNT (% or MVR off), FREE_ITEM (free add-on with a purchase), TIME_LIMITED (time-boxed special). Do not invent cashback, tiers or anything the portal can't do.
- Keep titles short and concrete, in the merchant's voice. No exclamation marks, no marketing fluff.
- Respect local rhythm where it fits naturally: Ramadan, Friday/weekend patterns, prayer-time lulls, tourist seasons.
- Call the propose_rewards tool with your final list. 5 to 8 rewards, every mechanic at least once.`;

function factsFor(m: {
  name: string;
  category: string | null;
  notes: string | null;
  address: string | null;
  posSystem: string | null;
  monthlyTxnVolume: number | null;
  subscriptionPlan: string | null;
  branches: number | null;
  status: string;
  loyaltyLive: boolean;
  zoneNames: string[];
}) {
  const lines = [
    `Name: ${m.name}`,
    `Category: ${m.category ?? "unknown"}`,
    `Status: ${m.status}${m.loyaltyLive ? " (loyalty already live)" : ""}`,
  ];
  if (m.address) lines.push(`Address: ${m.address}`);
  if (m.zoneNames.length > 0) lines.push(`Sales zones: ${m.zoneNames.join(", ")}`);
  if (m.branches) lines.push(`Branches: ${m.branches}`);
  if (m.monthlyTxnVolume) lines.push(`Monthly transactions: ~${m.monthlyTxnVolume}`);
  if (m.subscriptionPlan) lines.push(`Perx plan: ${m.subscriptionPlan}`);
  if (m.posSystem) lines.push(`POS: ${m.posSystem}`);
  if (m.notes) lines.push(`Rep notes: ${m.notes}`);
  return lines.join("\n");
}

// providerOverride exists for tests; production always resolves the
// configured org provider.
export async function generateAiRewards(
  ctx: SessionUser,
  merchantId: string,
  providerOverride?: AiProvider
): Promise<{ written: number; replaced: number }> {
  await assertMerchantEdit(ctx, merchantId);

  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: {
      name: true,
      category: true,
      notes: true,
      address: true,
      posSystem: true,
      monthlyTxnVolume: true,
      subscriptionPlan: true,
      branches: true,
      status: true,
      loyaltyLive: true,
      latitude: true,
      longitude: true,
    },
  });
  if (!merchant) throw new RewardError("Merchant not found.");

  const provider = providerOverride ?? (await getAiProvider());
  if (!provider) {
    throw new RewardError(`The AI provider isn't configured yet. ${await aiConfigHint()}`);
  }

  // Location signal: which drawn zones the merchant sits in.
  let zoneNames: string[] = [];
  if (merchant.latitude != null && merchant.longitude != null) {
    const point: LatLng = { lat: merchant.latitude, lng: merchant.longitude };
    const fences = await db.geofence.findMany({
      select: { name: true, shape: true, points: true, radiusM: true },
    });
    zoneNames = fences
      .filter((f) =>
        pointInGeofence(
          point,
          toGeofence({ shape: f.shape, points: (f.points as LatLng[]) ?? [], radiusM: f.radiusM })
        )
      )
      .map((f) => f.name);
  }

  const messages: AiMessage[] = [
    {
      role: "user",
      content: `Write the reward shortlist for this merchant:\n\n${factsFor({ ...merchant, zoneNames })}`,
    },
  ];

  // Two attempts: the second gets the validation error to correct against.
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = "";
    let toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
    for await (const event of provider.streamTurn({
      system: SYSTEM,
      messages,
      tools: [PROPOSE_TOOL],
    })) {
      if (event.type === "final") {
        text = event.text;
        toolCalls = event.toolCalls;
      }
    }

    const call = toolCalls.find((c) => c.name === PROPOSE_TOOL.name);
    if (!call) {
      messages.push({ role: "assistant", content: text, toolCalls });
      messages.push({
        role: "user",
        content: "You must call the propose_rewards tool with the final list.",
      });
      continue;
    }

    const parsed = proposalSchema.safeParse(call.input);
    if (!parsed.success) {
      messages.push({ role: "assistant", content: text, toolCalls });
      messages.push({
        role: "tool_results",
        results: [
          {
            toolCallId: call.id,
            name: PROPOSE_TOOL.name,
            content: `Invalid: ${parsed.error.issues
              .slice(0, 5)
              .map((i) => i.message)
              .join("; ")}. Fix and call propose_rewards again.`,
          },
        ],
      });
      continue;
    }

    // Valid set — swap out whatever is still replaceable, in one transaction
    // so the merchant never momentarily has fewer than the rule promises.
    const replaceable = (
      await db.curatedReward.findMany({
        where: { merchantId, status: "IDEA", source: { in: ["STARTER", "AI"] } },
        select: { id: true, createdAt: true, updatedAt: true },
      })
    ).filter((r) => r.updatedAt.getTime() === r.createdAt.getTime());

    await db.$transaction([
      db.curatedReward.deleteMany({ where: { id: { in: replaceable.map((r) => r.id) } } }),
      db.curatedReward.createMany({
        data: parsed.data.rewards.map((r) => ({
          merchantId,
          title: r.title,
          description: r.description ?? null,
          mechanic: r.mechanic,
          source: "AI" as const,
          createdById: ctx.id,
        })),
      }),
    ]);

    await audit({
      actorId: ctx.id,
      action: "curated_reward.ai_write",
      entityType: "MERCHANT",
      entityId: merchantId,
      merchantId,
      diff: {
        written: parsed.data.rewards.length,
        replaced: replaceable.length,
        provider: provider.label,
      },
    });

    return { written: parsed.data.rewards.length, replaced: replaceable.length };
  }

  throw new RewardError("The AI couldn't produce a valid shortlist. Try again in a moment.");
}
