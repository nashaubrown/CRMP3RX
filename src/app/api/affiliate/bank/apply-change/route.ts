import { readJson } from "@/lib/api";
import { apiError, apiJson, firstZodMessage, withAffiliate } from "@/lib/affiliate-api";
import { bankApplyChangeSchema } from "@/lib/validators/affiliate-portal";
import { applyBankChange } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Bank-change step 2: consume the emailed token and apply the new details.
export async function POST(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    const body = await readJson(req);
    const parsed = bankApplyChangeSchema.safeParse(body ?? {});
    if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));
    await applyBankChange(affiliate, parsed.data);
    return apiJson({ ok: true });
  });
}
