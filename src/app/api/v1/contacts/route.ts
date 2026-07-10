import { apiError, apiJson, isResponse, requireApiUser } from "@/lib/api";
import { contactListParamsSchema } from "@/lib/validators/contact";
import { listContacts } from "@/services/contacts";

export async function GET(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const url = new URL(req.url);
  const parsed = contactListParamsSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    merchantId: url.searchParams.get("merchantId") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
  });
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid query");

  const { items, total, page, pageCount } = await listContacts(user, parsed.data);
  return apiJson({
    total,
    page,
    pageCount,
    contacts: items.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      title: c.title,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
      merchant: { id: c.merchant.id, name: c.merchant.name },
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}
