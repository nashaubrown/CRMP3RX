import { apiJson, withAffiliate } from "@/lib/affiliate-api";
import { listPortalCommissions } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// The payout ledger (recorded periods) plus the current-month projection.
export async function GET(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    return apiJson(await listPortalCommissions(affiliate.id));
  });
}
