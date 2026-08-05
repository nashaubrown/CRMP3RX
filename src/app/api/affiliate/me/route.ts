import { readJson } from "@/lib/api";
import { apiError, apiJson, firstZodMessage, withAffiliate } from "@/lib/affiliate-api";
import { patchMeSchema } from "@/lib/validators/affiliate-portal";
import { getPortalProfile, setEmailNotifications } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Profile incl. masked ID/bank, payout schedule and completion flags.
export async function GET(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    return apiJson(await getPortalProfile(affiliate.id));
  });
}

// The only free-form writable field: the email-notifications toggle.
export async function PATCH(req: Request) {
  return withAffiliate(req, async (affiliate) => {
    const body = await readJson(req);
    const parsed = patchMeSchema.safeParse(body ?? {});
    if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));
    await setEmailNotifications(affiliate.id, parsed.data.emailNotifications);
    return apiJson({ ok: true });
  });
}
