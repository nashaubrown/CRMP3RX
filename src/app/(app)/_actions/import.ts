"use server";

import { revalidatePath } from "next/cache";

import { parseCsv } from "@/lib/csv";
import { requireUserOrThrow } from "@/lib/rbac";
import { importContactsCsv, importMerchantsCsv, type ImportResult } from "@/services/csv";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export type ImportState = { error: string | null; result?: ImportResult };

export async function importCsvAction(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const ctx = await requireUserOrThrow();

  const entity = formData.get("entity");
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file" };
  if (file.size === 0) return { error: "The file is empty" };
  if (file.size > MAX_FILE_BYTES) return { error: "File too large (max 2 MB)" };

  const records = parseCsv(await file.text());
  if (records.length === 0) {
    return { error: "No data rows found — the first line must be the column headers" };
  }

  let result: ImportResult;
  if (entity === "merchants") {
    result = await importMerchantsCsv(ctx, records);
  } else if (entity === "contacts") {
    result = await importContactsCsv(ctx, records);
  } else {
    return { error: "Unknown import type" };
  }

  const revalidate = formData.get("revalidate");
  if (typeof revalidate === "string" && revalidate.startsWith("/")) revalidatePath(revalidate);
  return { error: null, result };
}
