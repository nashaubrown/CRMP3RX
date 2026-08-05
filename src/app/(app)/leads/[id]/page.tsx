import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { BuildingIcon, MailIcon, PencilIcon, PhoneIcon } from "lucide-react";

import { deleteLeadAction } from "@/app/(app)/leads/actions";
import {
  ClaimLeadButton,
  ConvertLeadButton,
  LeadStatusSelect,
} from "@/app/(app)/leads/[id]/lead-actions";
import { DeleteButton } from "@/components/delete-button";
import { ScoreBadge } from "@/components/score-badge";
import { LeadStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/rbac";
import { getLead } from "@/services/leads";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const lead = await getLead(user, id);
  if (!lead) notFound();

  const title = lead.company ?? lead.merchant?.name ?? lead.name ?? "Unnamed lead";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Breadcrumbs items={[{ label: "Leads", href: "/leads" }, { label: title }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <ScoreBadge score={lead.score} />
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {lead.source.toLowerCase().replace("_", " ")} lead
            {lead.affiliate ? ` · via ${lead.affiliate.name}` : ""} ·{" "}
            {lead.owner ? `owned by ${lead.owner.id === user.id ? "you" : lead.owner.name}` : "unassigned"}{" "}
            · created {formatDateTime(lead.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.canClaim ? <ClaimLeadButton leadId={lead.id} /> : null}
          {lead.canEdit && !lead.merchantId && lead.company ? (
            <ConvertLeadButton leadId={lead.id} company={lead.company} />
          ) : null}
          {lead.canEdit ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/leads/${lead.id}/edit`}>
                  <PencilIcon /> Edit
                </Link>
              </Button>
              <DeleteButton
                action={deleteLeadAction.bind(null, lead.id)}
                title="Delete this lead?"
                description="This permanently deletes the lead. This cannot be undone."
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {lead.name ? <p>Contact: {lead.name}</p> : null}
            {lead.email ? (
              <p className="flex items-center gap-2">
                <MailIcon className="text-muted-foreground size-4" />
                <a href={`mailto:${lead.email}`} className="hover:underline">
                  {lead.email}
                </a>
              </p>
            ) : null}
            {lead.phone ? (
              <p className="flex items-center gap-2">
                <PhoneIcon className="text-muted-foreground size-4" />
                {formatPhone(lead.phone)}
              </p>
            ) : null}
            {lead.merchant ? (
              <p className="flex items-center gap-2">
                <BuildingIcon className="text-muted-foreground size-4" />
                <Link href={`/merchants/${lead.merchant.id}`} className="hover:underline">
                  {lead.merchant.name}
                </Link>
              </p>
            ) : null}
            {lead.message ? (
              <p className="text-muted-foreground border-t pt-2 whitespace-pre-wrap">
                {lead.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Work the lead</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {lead.canEdit ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <LeadStatusSelect leadId={lead.id} status={lead.status} />
              </div>
            ) : (
              <p className="text-muted-foreground">
                {lead.canClaim
                  ? "Assign this lead to yourself to work it."
                  : "Only the lead's owner or an admin can update it."}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Score is rule-based: source quality, contact details provided, written message, and
              (when linked) the merchant&apos;s transaction volume.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
