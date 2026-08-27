import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";

import { updateDealAction } from "@/app/(app)/deals/actions";
import { DealForm } from "@/app/(app)/deals/deal-form";
import { formatInTimeZone } from "date-fns-tz";

import { APP_TIMEZONE } from "@/lib/datetime";
import { isAdmin, requireUser } from "@/lib/rbac";
import { getDeal, listContactOptionsByMerchant } from "@/services/deals";
import { listEditableMerchantOptions } from "@/services/merchants";
import { listAssignableUsers } from "@/services/users";

export const metadata: Metadata = { title: "Edit deal" };

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const deal = await getDeal(user, id);
  if (!deal) notFound();
  if (!deal.canEdit) redirect(`/deals/${id}`);

  const merchants = await listEditableMerchantOptions(user);
  // Ensure the deal's own merchant is selectable even if not editable-listed
  if (!merchants.some((m) => m.id === deal.merchantId)) {
    merchants.push({ id: deal.merchantId, name: deal.merchant.name });
  }
  const [contactsByMerchant, owners] = await Promise.all([
    listContactOptionsByMerchant(merchants.map((m) => m.id)),
    listAssignableUsers(user),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Deals", href: "/deals" },
          { label: deal.title, href: `/deals/${deal.id}` },
          { label: "Edit" },
        ]}
      />
      <h1 className="text-xl font-semibold tracking-tight">Edit {deal.title}</h1>
      <DealForm
        action={updateDealAction.bind(null, deal.id)}
        defaultValues={{
          title: deal.title,
          merchantId: deal.merchantId,
          contactId: deal.contactId,
          value: String(deal.value),
          currency: deal.currency,
          expectedCloseDate: deal.expectedCloseDate
            ? formatInTimeZone(deal.expectedCloseDate, APP_TIMEZONE, "yyyy-MM-dd")
            : null,
          ownerId: deal.ownerId,
        }}
        merchants={merchants}
        contactsByMerchant={contactsByMerchant}
        owners={owners}
        showOwnerSelect={isAdmin(user)}
        cancelHref={`/deals/${deal.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
