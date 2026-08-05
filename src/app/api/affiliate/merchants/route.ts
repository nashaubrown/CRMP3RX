import { apiError, apiJson, firstZodMessage, withAffiliate } from "@/lib/affiliate-api";
import { portalMerchantsParamsSchema } from "@/lib/validators/affiliate-portal";
import { listPortalMerchants } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// The affiliate's referred merchants: name, category, friendly status,
// referred date — deliberately nothing pricing-related.
export async function GET(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    const url = new URL(req.url);
    const parsed = portalMerchantsParamsSchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      dir: url.searchParams.get("dir") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
    });
    if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));
    return apiJson(await listPortalMerchants(affiliate.id, parsed.data));
  });
}
