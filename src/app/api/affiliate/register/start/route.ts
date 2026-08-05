import { readJson } from "@/lib/api";
import {
  apiError,
  apiJson,
  authRateLimited,
  firstZodMessage,
  handlePortalError,
  tooMany,
} from "@/lib/affiliate-api";
import { registerStartSchema } from "@/lib/validators/affiliate-portal";
import { startRegistration } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Registration step 1: name/email/phone -> emails a 6-digit verification
// code. Always { ok: true } (no enumeration).
export async function POST(req: Request) {
  const body = await readJson(req);
  const parsed = registerStartSchema.safeParse(body ?? {});
  if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));

  if (authRateLimited(req, "register", parsed.data.email)) return tooMany();

  try {
    await startRegistration(parsed.data);
    return apiJson({ ok: true });
  } catch (e) {
    return handlePortalError(e);
  }
}
