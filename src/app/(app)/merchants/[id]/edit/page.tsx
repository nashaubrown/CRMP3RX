import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateMerchantAction } from "@/app/(app)/merchants/actions";
import { MerchantForm } from "@/app/(app)/merchants/merchant-form";
import { isAdmin, requireUser } from "@/lib/rbac";
import { getMerchant } from "@/services/merchants";
import { listAssignableUsers } from "@/services/users";

export const metadata: Metadata = { title: "Edit merchant" };

export default async function EditMerchantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [merchant, owners] = await Promise.all([
    getMerchant(user, id),
    listAssignableUsers(user),
  ]);
  if (!merchant) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {merchant.name}</h1>
      <MerchantForm
        action={updateMerchantAction.bind(null, merchant.id)}
        defaultValues={{
          name: merchant.name,
          category: merchant.category,
          status: merchant.status,
          website: merchant.website,
          phone: merchant.phone,
          email: merchant.email,
          address: merchant.address,
          notes: merchant.notes,
          posSystem: merchant.posSystem,
          monthlyTxnVolume: merchant.monthlyTxnVolume,
          loyaltyLive: merchant.loyaltyLive,
          ownerId: merchant.owner.id,
        }}
        owners={owners}
        showOwnerSelect={isAdmin(user)}
        cancelHref={`/merchants/${merchant.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
