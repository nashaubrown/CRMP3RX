import { apiError, apiJson, clientIp, withAffiliate } from "@/lib/affiliate-api";
import { acceptCurrentTerms } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Re-accept the current terms after an admin bumps the version (multipart:
// a fresh signature PNG). The portal blocks the dashboard behind this.
export async function POST(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError(400, "Expected a multipart form submission.");
    }
    const signature = form.get("signature");
    if (!(signature instanceof File) || signature.size === 0) {
      return apiError(400, "Sign the Terms & Conditions to continue.");
    }
    await acceptCurrentTerms(affiliate, new Uint8Array(await signature.arrayBuffer()), {
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return apiJson({ ok: true });
  });
}
