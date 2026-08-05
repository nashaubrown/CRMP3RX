import { rateLimit } from "@/lib/rate-limit";
import { apiJson, tooMany, withAffiliate } from "@/lib/affiliate-api";
import { requestBankChange } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Bank-change step 1: email a fresh confirmation link (re-auth before the
// edit form unlocks — "confirm it's you before changing where money goes").
export async function POST(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    if (!rateLimit(`aff:bank-change:${affiliate.id}`, 5, 15 * 60 * 1000)) return tooMany();
    await requestBankChange(affiliate);
    return apiJson({ ok: true });
  });
}
