import { readJson } from "@/lib/api";
import {
  apiError,
  apiJson,
  authRateLimited,
  firstZodMessage,
  handlePortalError,
  tooMany,
} from "@/lib/affiliate-api";
import { requestLinkSchema } from "@/lib/validators/affiliate-portal";
import { requestLoginLink } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Magic-link request. Always { ok: true } (no enumeration).
export async function POST(req: Request) {
  const body = await readJson(req);
  const parsed = requestLinkSchema.safeParse(body ?? {});
  if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));

  if (authRateLimited(req, "login", parsed.data.email)) return tooMany();

  try {
    await requestLoginLink(parsed.data.email);
    return apiJson({ ok: true });
  } catch (e) {
    return handlePortalError(e);
  }
}
