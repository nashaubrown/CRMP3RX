import { rateLimit } from "@/lib/rate-limit";
import {
  apiError,
  apiJson,
  clientIp,
  firstZodMessage,
  handlePortalError,
  tooMany,
} from "@/lib/affiliate-api";
import { submitApplicationSchema } from "@/lib/validators/affiliate-portal";
import { submitApplication } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Registration final submit (multipart): identity + bank fields + ID document
// + signature PNG. Authorized by the draft token from verify-email.
export async function POST(req: Request) {
  if (!rateLimit(`aff:submit:ip:${clientIp(req)}`, 3, 24 * 60 * 60 * 1000)) {
    return tooMany();
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, "Expected a multipart form submission.");
  }

  const parsed = submitApplicationSchema.safeParse({
    draftToken: form.get("draftToken") ?? "",
    idCardNumber: form.get("idCardNumber") ?? "",
    bankName: form.get("bankName") ?? "",
    bankAccountName: form.get("bankAccountName") ?? "",
    bankAccountNumber: form.get("bankAccountNumber") ?? "",
    tcVersion: form.get("tcVersion") ?? "",
    agree: form.get("agree") ?? "",
  });
  if (!parsed.success) return apiError(400, firstZodMessage(parsed.error));

  const idDocument = form.get("idDocument");
  const signature = form.get("signature");
  if (!(idDocument instanceof File) || idDocument.size === 0) {
    return apiError(400, "Attach a photo or scan of your ID card.");
  }
  if (!(signature instanceof File) || signature.size === 0) {
    return apiError(400, "Sign the Terms & Conditions before submitting.");
  }

  try {
    await submitApplication(
      parsed.data,
      {
        idDocument: {
          bytes: new Uint8Array(await idDocument.arrayBuffer()),
          declaredType: idDocument.type,
        },
        signature: { bytes: new Uint8Array(await signature.arrayBuffer()) },
      },
      { ip: clientIp(req), userAgent: req.headers.get("user-agent") }
    );
    return apiJson({ ok: true });
  } catch (e) {
    return handlePortalError(e);
  }
}
