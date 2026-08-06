import { getSessionUser } from "@/lib/rbac";
import { PermissionError } from "@/services/permissions";
import {
  exportAffiliatesCsv,
  exportContactsCsv,
  exportDealsCsv,
  exportLeadsCsv,
  exportMerchantsCsv,
} from "@/services/csv";

// CSV download for the signed-in user (session auth — the link is clicked in
// the browser). Honors the same filters as the list pages.
export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { entity } = await params;
  const url = new URL(req.url);
  const f = {
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
    merchantId: url.searchParams.get("merchantId") ?? undefined,
    owner: url.searchParams.get("owner") ?? undefined,
    affiliate: url.searchParams.get("affiliate") ?? undefined,
    pos: url.searchParams.get("pos") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  let csv: string;
  try {
    switch (entity) {
      case "merchants":
        csv = await exportMerchantsCsv(user, f);
        break;
      case "contacts":
        csv = await exportContactsCsv(user, f);
        break;
      case "deals":
        csv = await exportDealsCsv(user, f);
        break;
      case "leads":
        csv = await exportLeadsCsv(user, f);
        break;
      case "affiliates":
        csv = await exportAffiliatesCsv(user, f);
        break;
      default:
        return new Response("Unknown export", { status: 404 });
    }
  } catch (e) {
    // A rep without the export capability gets a plain 403, not a 500.
    if (e instanceof PermissionError) return new Response(e.message, { status: 403 });
    throw e;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="perx-${entity}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
