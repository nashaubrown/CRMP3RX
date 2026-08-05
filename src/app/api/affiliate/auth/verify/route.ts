import { readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import {
  apiError,
  apiJson,
  clientIp,
  firstZodMessage,
  handlePortalError,
  tooMany,
} from "@/lib/affiliate-api";
import { verifyTokenSchema } from "@/lib/validators/affiliate-portal";
import { verifyLoginToken } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Exchange a magic-link token for a 30-day session token.
export async function POST(req: Request) {
  if (!rateLimit(`aff:auth-verify:ip:${clientIp(req)}`, 10, 15 * 60 * 1000)) {
    return tooMany();
  }
  const body = await readJson(req);
  const parsed = verifyTokenSchema.safeParse(body ?? {});
  if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));

  try {
    const session = await verifyLoginToken(parsed.data.token);
    if (!session) {
      return apiError(400, "That sign-in link has expired or was already used.");
    }
    return apiJson(session);
  } catch (e) {
    return handlePortalError(e);
  }
}
