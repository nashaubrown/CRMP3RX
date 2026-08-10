import type { CuratedRewardStatus, RewardMechanic } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import type { CuratedRewardInput, RewardTemplateInput } from "@/lib/validators/reward";
import { audit } from "@/services/audit";
import { assertMerchantEdit, canSeeMerchant } from "@/services/merchant-access";

export class RewardError extends Error {}

export const MECHANIC_LABELS: Record<RewardMechanic, string> = {
  STAMP_CARD: "Stamp / points",
  DISCOUNT: "Discount",
  FREE_ITEM: "Free item",
  TIME_LIMITED: "Time-limited",
};

export const REWARD_STATUS_LABELS: Record<CuratedRewardStatus, string> = {
  IDEA: "Idea",
  PITCHED: "Pitched",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};

// ---- library (admin-managed, like option sets) ------------------------------

function assertAdmin(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new RewardError("Only admins can manage the reward library.");
}

// Everyone may read the library — reps pull from it on merchant pages.
// includeArchived is for the Settings manager, which shows what's retired.
export function listRewardTemplates(opts?: { includeArchived?: boolean }) {
  return db.rewardTemplate.findMany({
    where: opts?.includeArchived ? {} : { archived: false },
    orderBy: [{ category: { sort: "asc", nulls: "first" } }, { title: "asc" }],
  });
}

export async function createRewardTemplate(ctx: SessionUser, input: RewardTemplateInput) {
  assertAdmin(ctx);
  const t = await db.rewardTemplate.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      mechanic: input.mechanic,
      category: input.category ?? null,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "reward_template.create",
    entityType: "REWARD_TEMPLATE",
    entityId: t.id,
    diff: { title: t.title, mechanic: t.mechanic, category: t.category },
  });
  return t;
}

export async function updateRewardTemplate(
  ctx: SessionUser,
  id: string,
  input: RewardTemplateInput & { archived?: boolean }
) {
  assertAdmin(ctx);
  const before = await db.rewardTemplate.findUnique({ where: { id } });
  if (!before) throw new RewardError("Template not found.");
  const t = await db.rewardTemplate.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description ?? null,
      mechanic: input.mechanic,
      category: input.category ?? null,
      archived: input.archived ?? before.archived,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "reward_template.update",
    entityType: "REWARD_TEMPLATE",
    entityId: id,
    diff: { title: t.title, archived: t.archived },
  });
  return t;
}

// Archive, don't delete: curated rewards keep their provenance and the idea
// can be revived. Hard deletion is deliberately not offered.
export async function archiveRewardTemplate(ctx: SessionUser, id: string, archived: boolean) {
  assertAdmin(ctx);
  const t = await db.rewardTemplate.update({ where: { id }, data: { archived } });
  await audit({
    actorId: ctx.id,
    action: archived ? "reward_template.archive" : "reward_template.restore",
    entityType: "REWARD_TEMPLATE",
    entityId: id,
    diff: { title: t.title },
  });
  return t;
}

// ---- starter curation --------------------------------------------------------

// Every merchant should open with a working shortlist: at least this many
// ideas, covering every mechanic the portal supports.
export const STARTER_REWARD_COUNT = 5;

const ALL_MECHANICS: RewardMechanic[] = ["STAMP_CARD", "DISCOUNT", "FREE_ITEM", "TIME_LIMITED"];

// Curates the starter set for a fresh merchant from the active library:
// one idea per mechanic first (own category preferred, evergreens as
// fallback), then fills to the minimum count. Best-effort by design — a
// thin or empty library must never fail the merchant create that called us.
export async function curateStarterRewards(merchant: {
  id: string;
  category: string | null;
  ownerId: string;
}) {
  try {
    const templates = await db.rewardTemplate.findMany({
      where: {
        archived: false,
        OR: [{ category: null }, ...(merchant.category ? [{ category: merchant.category }] : [])],
      },
      orderBy: [{ title: "asc" }],
    });
    if (templates.length === 0) return;

    const own = templates.filter((t) => t.category != null);
    const evergreen = templates.filter((t) => t.category == null);
    const picked: typeof templates = [];
    const used = new Set<string>();
    const take = (t: (typeof templates)[number] | undefined) => {
      if (t && !used.has(t.id)) {
        picked.push(t);
        used.add(t.id);
      }
    };

    for (const mech of ALL_MECHANICS) {
      take(own.find((t) => t.mechanic === mech) ?? evergreen.find((t) => t.mechanic === mech));
    }
    for (const t of [...own, ...evergreen]) {
      if (picked.length >= STARTER_REWARD_COUNT) break;
      take(t);
    }

    await db.curatedReward.createMany({
      data: picked.map((t) => ({
        merchantId: merchant.id,
        templateId: t.id,
        title: t.title,
        description: t.description,
        mechanic: t.mechanic,
        createdById: merchant.ownerId,
      })),
    });
  } catch {
    // Starter ideas are a nicety; the merchant itself must always land.
  }
}

// ---- per-merchant curated rewards -------------------------------------------

// Visibility follows the merchant: whoever can open the merchant page can see
// its curated rewards; editing them requires merchant edit access.
export async function listCuratedRewards(ctx: SessionUser, merchantId: string) {
  if (!(await canSeeMerchant(ctx, merchantId))) return [];
  return db.curatedReward.findMany({
    where: { merchantId },
    orderBy: [{ createdAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });
}

export async function addCuratedReward(
  ctx: SessionUser,
  merchantId: string,
  input: CuratedRewardInput
) {
  await assertMerchantEdit(ctx, merchantId);

  // When curating from a template, copy its wording at this moment — later
  // library edits must not rewrite what was already pitched.
  let templateId: string | null = null;
  let title = input.title;
  let description = input.description ?? null;
  let mechanic = input.mechanic;
  if (input.templateId) {
    const t = await db.rewardTemplate.findUnique({ where: { id: input.templateId } });
    if (!t) throw new RewardError("That library idea no longer exists.");
    templateId = t.id;
    title = input.title || t.title;
    description = input.description ?? t.description;
    mechanic = input.mechanic ?? t.mechanic;
  }
  if (!title) throw new RewardError("A reward needs a title.");
  if (!mechanic) throw new RewardError("Pick a mechanic for the reward.");

  const r = await db.curatedReward.create({
    data: {
      merchantId,
      templateId,
      title,
      description,
      mechanic,
      notes: input.notes ?? null,
      createdById: ctx.id,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "curated_reward.create",
    entityType: "CURATED_REWARD",
    entityId: r.id,
    merchantId,
    diff: { title: r.title, mechanic: r.mechanic, fromTemplate: templateId != null },
  });
  return r;
}

export async function updateCuratedReward(
  ctx: SessionUser,
  id: string,
  input: CuratedRewardInput
) {
  const existing = await db.curatedReward.findUnique({ where: { id } });
  if (!existing) throw new RewardError("Reward not found.");
  await assertMerchantEdit(ctx, existing.merchantId);
  if (!input.title) throw new RewardError("A reward needs a title.");
  if (!input.mechanic) throw new RewardError("Pick a mechanic for the reward.");

  const r = await db.curatedReward.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description ?? null,
      mechanic: input.mechanic,
      notes: input.notes ?? null,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "curated_reward.update",
    entityType: "CURATED_REWARD",
    entityId: id,
    merchantId: existing.merchantId,
    diff: { title: r.title },
  });
  return r;
}

export async function setCuratedRewardStatus(
  ctx: SessionUser,
  id: string,
  status: CuratedRewardStatus
) {
  const existing = await db.curatedReward.findUnique({ where: { id } });
  if (!existing) throw new RewardError("Reward not found.");
  await assertMerchantEdit(ctx, existing.merchantId);
  const r = await db.curatedReward.update({ where: { id }, data: { status } });
  await audit({
    actorId: ctx.id,
    action: "curated_reward.status",
    entityType: "CURATED_REWARD",
    entityId: id,
    merchantId: existing.merchantId,
    diff: { from: existing.status, to: status, title: existing.title },
  });
  return r;
}

export async function deleteCuratedReward(ctx: SessionUser, id: string) {
  const existing = await db.curatedReward.findUnique({ where: { id } });
  if (!existing) throw new RewardError("Reward not found.");
  await assertMerchantEdit(ctx, existing.merchantId);
  await db.curatedReward.delete({ where: { id } });
  await audit({
    actorId: ctx.id,
    action: "curated_reward.delete",
    entityType: "CURATED_REWARD",
    entityId: id,
    merchantId: existing.merchantId,
    diff: { title: existing.title },
  });
}
