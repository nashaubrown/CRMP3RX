import { apiJson, withAffiliate } from "@/lib/affiliate-api";
import { getPortalOverview } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Dashboard payload: stats, projection, recent ledger entries, profile.
export async function GET(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    return apiJson(await getPortalOverview(affiliate.id));
  });
}
