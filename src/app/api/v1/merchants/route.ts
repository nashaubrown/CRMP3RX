import { apiError, apiJson, isResponse, readJson, requireApiUser } from "@/lib/api";
import { merchantListParamsSchema, merchantSchema } from "@/lib/validators/merchant";
import { createMerchant, listMerchants } from "@/services/merchants";

export async function GET(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const url = new URL(req.url);
  const parsed = merchantListParamsSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
  });
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid query");

  const { items, total, page, pageCount } = await listMerchants(user, parsed.data);
  return apiJson({
    total,
    page,
    pageCount,
    merchants: items.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      category: m.category,
      email: m.email,
      phone: m.phone,
      website: m.website,
      address: m.address,
      posSystem: m.posSystem,
      monthlyTxnVolume: m.monthlyTxnVolume,
      loyaltyLive: m.loyaltyLive,
      owner: m.owner,
      contactCount: m._count.contacts,
      dealCount: m._count.deals,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const body = await readJson(req);
  if (!body) return apiError(400, "Expected a JSON body");

  // The form schema expects string inputs; accept natural JSON types too.
  const parsed = merchantSchema.safeParse({
    ...body,
    status: body.status ?? "PROSPECT",
    monthlyTxnVolume:
      typeof body.monthlyTxnVolume === "number" ? String(body.monthlyTxnVolume) : body.monthlyTxnVolume,
    loyaltyLive: body.loyaltyLive === true ? true : undefined,
  });
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");

  try {
    const merchant = await createMerchant(user, parsed.data);
    return apiJson({ id: merchant.id, name: merchant.name, status: merchant.status }, 201);
  } catch (e) {
    return apiError(400, e instanceof Error ? e.message : "Something went wrong");
  }
}
