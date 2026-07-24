import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { updateMerchantAction } from "@/app/(app)/merchants/actions";
import { MerchantForm } from "@/app/(app)/merchants/merchant-form";
import { isAdmin, requireUser } from "@/lib/rbac";
import { getMerchant } from "@/services/merchants";
import { listOptions } from "@/services/option-sets";
import { listAssignableUsers } from "@/services/users";

export const metadata: Metadata = { title: "Edit merchant" };

export default async function EditMerchantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const merchant = await getMerchant(user, id);
  if (!merchant) notFound();
  // View-only users can see the record but not this form.
  if (!merchant.access.canEdit) redirect(`/merchants/${id}`);

  const [owners, categoryOptions, planOptions] = await Promise.all([
    listAssignableUsers(user),
    // Keep the current value selectable even if it was later archived.
    listOptions("MERCHANT_CATEGORY", merchant.category),
    listOptions("SUBSCRIPTION_PLAN", merchant.subscriptionPlan),
  ]);

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
          subscriptionPlan: merchant.subscriptionPlan,
          branches: merchant.branches,
          beta: merchant.beta,
          latitude: merchant.latitude,
          longitude: merchant.longitude,
          ownerId: merchant.owner.id,
        }}
        owners={owners}
        showOwnerSelect={isAdmin(user)}
        categoryOptions={categoryOptions}
        planOptions={planOptions}
        cancelHref={`/merchants/${merchant.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
