import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";

import { updateLeadAction } from "@/app/(app)/leads/actions";
import { LeadForm } from "@/app/(app)/leads/lead-form";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getLead } from "@/services/leads";

export const metadata: Metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [lead, merchants] = await Promise.all([
    getLead(user, id),
    db.merchant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!lead) notFound();
  if (!lead.canEdit) redirect(`/leads/${id}`);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Leads", href: "/leads" },
          { label: "Edit", href: `/leads/${lead.id}` },
        ]}
      />
      <h1 className="text-xl font-semibold tracking-tight">Edit lead</h1>
      <LeadForm
        action={updateLeadAction.bind(null, lead.id)}
        defaultValues={{
          source: lead.source,
          status: lead.status,
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          message: lead.message,
          merchantId: lead.merchantId,
        }}
        merchants={merchants}
        cancelHref={`/leads/${lead.id}`}
        submitLabel="Save changes"
      />
    </div>
  );
}
