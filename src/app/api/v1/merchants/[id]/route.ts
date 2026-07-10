import { apiError, apiJson, isResponse, requireApiUser } from "@/lib/api";
import { getMerchant } from "@/services/merchants";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const { id } = await params;
  const merchant = await getMerchant(user, id);
  if (!merchant) return apiError(404, "Merchant not found");

  return apiJson({
    id: merchant.id,
    name: merchant.name,
    status: merchant.status,
    category: merchant.category,
    email: merchant.email,
    phone: merchant.phone,
    website: merchant.website,
    address: merchant.address,
    notes: merchant.notes,
    posSystem: merchant.posSystem,
    monthlyTxnVolume: merchant.monthlyTxnVolume,
    loyaltyLive: merchant.loyaltyLive,
    owner: merchant.owner,
    access: merchant.access,
    contacts: merchant.contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      title: c.title,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
    })),
    deals: merchant.deals,
    createdAt: merchant.createdAt,
    updatedAt: merchant.updatedAt,
  });
}
