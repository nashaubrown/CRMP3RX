import { apiError, apiJson, isResponse, requireApiUser } from "@/lib/api";
import { getDealsBoard } from "@/services/deals";

const STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

export async function GET(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "mine" ? "mine" : "all";
  const stage = url.searchParams.get("stage");
  if (stage && !STAGES.includes(stage)) {
    return apiError(400, `Invalid stage. One of: ${STAGES.join(", ")}`);
  }

  const { deals, summaries } = await getDealsBoard(user, scope);
  const filtered = stage ? deals.filter((d) => d.stage === stage) : deals;

  return apiJson({
    scope,
    summaries,
    deals: filtered.map((d) => ({
      id: d.id,
      title: d.title,
      stage: d.stage,
      value: d.value,
      currency: d.currency,
      merchantId: d.merchantId,
      merchant: d.merchantName,
      owner: d.ownerName,
      expectedCloseDate: d.expectedCloseDate,
    })),
  });
}
