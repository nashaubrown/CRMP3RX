import { apiError, apiJson, handlePortalError } from "@/lib/affiliate-api";
import { getPublishedTerms } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Current affiliate Terms & Conditions (public — shown before registration).
export async function GET() {
  try {
    const terms = await getPublishedTerms();
    if (!terms) return apiError(404, "Terms & Conditions have not been published yet.");
    return apiJson(terms);
  } catch (e) {
    return handlePortalError(e);
  }
}
