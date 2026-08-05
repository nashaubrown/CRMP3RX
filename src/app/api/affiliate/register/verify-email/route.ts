import { readJson } from "@/lib/api";
import {
  apiError,
  apiJson,
  authRateLimited,
  firstZodMessage,
  handlePortalError,
  tooMany,
} from "@/lib/affiliate-api";
import { registerVerifyEmailSchema } from "@/lib/validators/affiliate-portal";
import { verifyRegistrationEmail } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Registration step 1b: exchange the emailed 6-digit code for a draft token.
// Rate-limited hard — a 6-digit code must not be brute-forceable.
export async function POST(req: Request) {
  const body = await readJson(req);
  const parsed = registerVerifyEmailSchema.safeParse(body ?? {});
  if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));

  if (authRateLimited(req, "verify-email", parsed.data.email)) return tooMany();

  try {
    const draft = await verifyRegistrationEmail(parsed.data.email, parsed.data.code);
    if (!draft) return apiError(400, "That code is wrong or has expired — request a new one.");
    return apiJson(draft);
  } catch (e) {
    return handlePortalError(e);
  }
}
