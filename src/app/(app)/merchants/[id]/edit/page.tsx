import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { updateMerchantAction } from "@/app/(app)/merchants/actions";
import { MerchantForm } from "@/app/(app)/merchants/merchant-form";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { isAdmin, requireUser } from "@/lib/rbac";
import { getMerchant } from "@/services/merchants";
import { listOptions } from "@/services/option-sets";
import { listAffiliateOptions } from "@/services/affiliates";
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

  const [owners, categoryOptions, planOptions, affiliateOptions] = await Promise.all([
    listAssignableUsers(user),
    // Keep the current value selectable even if it was later archived.
    listOptions("MERCHANT_CATEGORY", merchant.category),
    listOptions("SUBSCRIPTION_PLAN", merchant.subscriptionPlan),
    listAffiliateOptions(merchant.affiliateId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Merchants", href: "/merchants" },
          { label: merchant.name, href: `/merchants/${merchant.id}` },
          { label: "Edit" },
        ]}
      />
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
          affiliateId: merchant.affiliateId,
        }}
        owners={owners}
        showOwnerSelect={isAdmin(user)}
        categoryOptions={categoryOptions}
        planOptions={planOptions}
        affiliateOptions={affiliateOptions}
        showLocation={false}
        cancelHref={`/merchants/${merchant.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
