import type { Metadata } from "next";

import { createContactAction } from "@/app/(app)/contacts/actions";
import { ContactForm } from "@/app/(app)/contacts/contact-form";
import { requireUser } from "@/lib/rbac";
import { listMerchantOptions } from "@/services/merchants";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ merchantId?: string }>;
}) {
  const user = await requireUser();
  const { merchantId } = await searchParams;
  const merchants = await listMerchantOptions(user);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">New contact</h1>
      <ContactForm
        action={createContactAction}
        defaultValues={{ merchantId }}
        merchants={merchants}
        cancelHref={merchantId ? `/merchants/${merchantId}` : "/contacts"}
        submitLabel="Create contact"
      />
    </div>
  );
}
