import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { updateContactAction } from "@/app/(app)/contacts/actions";
import { ContactForm } from "@/app/(app)/contacts/contact-form";
import { requireUser } from "@/lib/rbac";
import { getContact } from "@/services/contacts";
import { listEditableMerchantOptions } from "@/services/merchants";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [contact, merchants] = await Promise.all([
    getContact(user, id),
    listEditableMerchantOptions(user),
  ]);
  if (!contact) notFound();
  // View-only users can see the record but not this form.
  if (!contact.access.canEdit) redirect(`/contacts/${id}`);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit {contact.firstName} {contact.lastName}
      </h1>
      <ContactForm
        action={updateContactAction.bind(null, contact.id)}
        defaultValues={{
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          merchantId: contact.merchantId,
          isPrimary: contact.isPrimary,
        }}
        merchants={merchants}
        cancelHref={`/contacts/${contact.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
