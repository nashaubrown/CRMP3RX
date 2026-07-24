import type { OptionSetKey } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { isAdmin, type SessionUser } from "@/lib/authz";

// Admin-managed dropdown values (option sets). Reads are open to any signed-in
// user (they populate form dropdowns); all mutations are admin-only.

export class OptionSetError extends Error {}

function assertAdmin(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new OptionSetError("Only admins can manage option sets.");
}

export const OPTION_SETS: { key: OptionSetKey; label: string; description: string }[] = [
  {
    key: "MERCHANT_CATEGORY",
    label: "Merchant category",
    description: "Business categories shown on the merchant form.",
  },
  {
    key: "SUBSCRIPTION_PLAN",
    label: "Subscription plan",
    description: "Perx plans a merchant can be on.",
  },
];

const optionSetKeySchema = z.enum(["MERCHANT_CATEGORY", "SUBSCRIPTION_PLAN"]);
const labelSchema = z.string().trim().min(1, "Enter a value").max(80);

// Active values for a set, for use in a dropdown. `includeValue` keeps a
// currently-stored value visible even if it was later archived, so editing an
// existing record never silently drops its selection.
export async function listOptions(
  setKey: OptionSetKey,
  includeValue?: string | null
): Promise<string[]> {
  const items = await db.optionItem.findMany({
    where: { setKey, archived: false },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { label: true },
  });
  const labels = items.map((i) => i.label);
  if (includeValue && !labels.includes(includeValue)) labels.push(includeValue);
  return labels;
}

export type ManagedOption = {
  id: string;
  label: string;
  sortOrder: number;
  archived: boolean;
};

// Full list (including archived) for the admin manager UI.
export async function listManagedOptions(
  ctx: SessionUser,
  setKey: OptionSetKey
): Promise<ManagedOption[]> {
  assertAdmin(ctx);
  return db.optionItem.findMany({
    where: { setKey },
    orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, label: true, sortOrder: true, archived: true },
  });
}

export async function addOption(
  ctx: SessionUser,
  setKeyInput: string,
  labelInput: string
): Promise<void> {
  assertAdmin(ctx);
  const setKey = optionSetKeySchema.parse(setKeyInput);
  const label = labelSchema.parse(labelInput);

  const existing = await db.optionItem.findUnique({
    where: { setKey_label: { setKey, label } },
    select: { id: true, archived: true },
  });
  if (existing) {
    // Re-adding a previously archived value just reactivates it.
    if (existing.archived) {
      await db.optionItem.update({ where: { id: existing.id }, data: { archived: false } });
      return;
    }
    throw new OptionSetError("That value already exists.");
  }

  const last = await db.optionItem.findFirst({
    where: { setKey },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await db.optionItem.create({
    data: { setKey, label, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
}

export async function renameOption(
  ctx: SessionUser,
  id: string,
  labelInput: string
): Promise<void> {
  assertAdmin(ctx);
  const label = labelSchema.parse(labelInput);
  const item = await db.optionItem.findUnique({ where: { id }, select: { setKey: true } });
  if (!item) throw new OptionSetError("Option not found.");

  const clash = await db.optionItem.findUnique({
    where: { setKey_label: { setKey: item.setKey, label } },
    select: { id: true },
  });
  if (clash && clash.id !== id) throw new OptionSetError("Another value already uses that name.");

  await db.optionItem.update({ where: { id }, data: { label } });
}

export async function setOptionArchived(
  ctx: SessionUser,
  id: string,
  archived: boolean
): Promise<void> {
  assertAdmin(ctx);
  await db.optionItem.update({ where: { id }, data: { archived } });
}
