import type { Metadata } from "next";

import { createDealAction } from "@/app/(app)/deals/actions";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { DealForm } from "@/app/(app)/deals/deal-form";
import { isAdmin, requireUser } from "@/lib/rbac";
import { listContactOptionsByMerchant } from "@/services/deals";
import { listEditableMerchantOptions } from "@/services/merchants";
import { listAssignableUsers } from "@/services/users";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ merchantId?: string }>;
}) {
  const user = await requireUser();
  const { merchantId } = await searchParams;

  const merchants = await listEditableMerchantOptions(user);
  const [contactsByMerchant, owners] = await Promise.all([
    listContactOptionsByMerchant(merchants.map((m) => m.id)),
    listAssignableUsers(user),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Breadcrumbs items={[{ label: "Deals", href: "/deals" }, { label: "New" }]} />
      <h1 className="text-xl font-semibold tracking-tight">New deal</h1>
      <DealForm
        action={createDealAction}
        defaultValues={{ merchantId }}
        merchants={merchants}
        contactsByMerchant={contactsByMerchant}
        owners={owners}
        showOwnerSelect={isAdmin(user)}
        cancelHref="/deals"
        submitLabel="Create deal"
      />
    </div>
  );
}
