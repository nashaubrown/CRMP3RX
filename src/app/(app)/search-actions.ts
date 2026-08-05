"use server";

import { requireUserOrThrow } from "@/lib/rbac";
import { quickSearch, type QuickHit } from "@/services/search";

// Called from the ⌘K palette on every keystroke (debounced client-side).
export async function quickSearchAction(query: string): Promise<QuickHit[]> {
  const ctx = await requireUserOrThrow();
  return quickSearch(ctx, query);
}
