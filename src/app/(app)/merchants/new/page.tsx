import type { Metadata } from "next";

import { MerchantForm } from "@/app/(app)/merchants/merchant-form";
import { createMerchantAction } from "@/app/(app)/merchants/actions";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { isAdmin, requireUser } from "@/lib/rbac";
import { listOptions } from "@/services/option-sets";
import { listAssignableUsers } from "@/services/users";

export const metadata: Metadata = { title: "New merchant" };

export default async function NewMerchantPage() {
  const user = await requireUser();
  const [owners, categoryOptions, planOptions] = await Promise.all([
    listAssignableUsers(user),
    listOptions("MERCHANT_CATEGORY"),
    listOptions("SUBSCRIPTION_PLAN"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Breadcrumbs items={[{ label: "Merchants", href: "/merchants" }, { label: "New" }]} />
      <h1 className="text-2xl font-semibold tracking-tight">New merchant</h1>
      <MerchantForm
        action={createMerchantAction}
        owners={owners}
        showOwnerSelect={isAdmin(user)}
        defaultOwnerId={user.id}
        categoryOptions={categoryOptions}
        planOptions={planOptions}
        showContacts
        showDeal
        cancelHref="/merchants"
        submitLabel="Create merchant"
      />
    </div>
  );
}
