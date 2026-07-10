import { apiError, apiJson, isResponse, requireApiUser } from "@/lib/api";
import { getContact } from "@/services/contacts";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const { id } = await params;
  const contact = await getContact(user, id);
  if (!contact) return apiError(404, "Contact not found");

  return apiJson({
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    title: contact.title,
    email: contact.email,
    phone: contact.phone,
    isPrimary: contact.isPrimary,
    merchant: { id: contact.merchant.id, name: contact.merchant.name },
    deals: contact.deals,
    access: contact.access,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  });
}
