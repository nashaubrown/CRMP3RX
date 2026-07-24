import type { Metadata } from "next";

import { createLeadAction } from "@/app/(app)/leads/actions";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { LeadForm } from "@/app/(app)/leads/lead-form";
import { requireUser } from "@/lib/rbac";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await requireUser();
  const merchants = await db.merchant.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Breadcrumbs items={[{ label: "Leads", href: "/leads" }, { label: "New" }]} />
      <h1 className="text-2xl font-semibold tracking-tight">New lead</h1>
      <LeadForm
        action={createLeadAction}
        merchants={merchants}
        cancelHref="/leads"
        submitLabel="Create lead"
      />
    </div>
  );
}
