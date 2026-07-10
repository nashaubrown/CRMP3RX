import { apiError, apiJson, isResponse, requireApiUser } from "@/lib/api";
import { leadListParamsSchema } from "@/lib/validators/lead";
import { listLeads } from "@/services/leads";

export async function GET(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const url = new URL(req.url);
  const parsed = leadListParamsSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
  });
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid query");

  const { items, total, page, pageCount } = await listLeads(user, parsed.data);
  return apiJson({
    total,
    page,
    pageCount,
    leads: items.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.company,
      email: l.email,
      phone: l.phone,
      source: l.source,
      status: l.status,
      score: l.score,
      owner: l.owner ? { id: l.owner.id, name: l.owner.name } : null,
      merchant: l.merchant ? { id: l.merchant.id, name: l.merchant.name } : null,
      contact: l.contact
        ? { id: l.contact.id, name: `${l.contact.firstName} ${l.contact.lastName}` }
        : null,
      createdAt: l.createdAt,
    })),
  });
}
