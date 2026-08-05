import { readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, apiJson, firstZodMessage, tooMany, withAffiliate } from "@/lib/affiliate-api";
import { portalReferralSchema } from "@/lib/validators/affiliate-portal";
import { listMyReferrals, submitReferral } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Submit a referral -> a CRM Lead attributed to this affiliate.
export async function POST(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    if (!rateLimit(`aff:referrals:${affiliate.id}`, 20, 24 * 60 * 60 * 1000)) return tooMany();
    const body = await readJson(req);
    const parsed = portalReferralSchema.safeParse(body ?? {});
    if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));
    await submitReferral(affiliate, parsed.data);
    return apiJson({ ok: true });
  });
}

// The affiliate's own submissions (Received / Converted).
export async function GET(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    return apiJson({ referrals: await listMyReferrals(affiliate.id) });
  });
}
