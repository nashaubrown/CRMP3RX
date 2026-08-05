import { apiError, apiJson, handlePortalError } from "@/lib/affiliate-api";
import { getApplicationStatus } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Application status by signed link (from the confirmation email). No PII.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return apiError(400, "Missing status token.");
  try {
    const status = await getApplicationStatus(token);
    if (!status) return apiError(404, "That status link has expired.");
    return apiJson({ status });
  } catch (e) {
    return handlePortalError(e);
  }
}
