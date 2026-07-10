import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildingIcon, MailIcon, PencilIcon, PhoneIcon } from "lucide-react";

import { deleteContactAction } from "@/app/(app)/contacts/actions";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { DeleteButton } from "@/components/delete-button";
import { DealStageBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { isAdmin, requireUser } from "@/lib/rbac";
import { listActivitiesForEntity } from "@/services/activities";
import { getContact } from "@/services/contacts";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const contact = await getContact(user, id);
  if (!contact) notFound();

  const activities = await listActivitiesForEntity(user, "CONTACT", id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {contact.firstName} {contact.lastName}
            </h1>
            {contact.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {contact.title ? `${contact.title} · ` : ""}
            <Link href={`/merchants/${contact.merchant.id}`} className="hover:underline">
              {contact.merchant.name}
            </Link>
          </p>
        </div>
        {contact.access.canEdit ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/contacts/${contact.id}/edit`}>
                <PencilIcon /> Edit
              </Link>
            </Button>
            <DeleteButton
              action={deleteContactAction.bind(null, contact.id)}
              title={`Delete ${contact.firstName} ${contact.lastName}?`}
              description="This permanently deletes the contact. This cannot be undone."
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="flex items-center gap-2">
                <BuildingIcon className="text-muted-foreground size-4" />
                <Link href={`/merchants/${contact.merchant.id}`} className="hover:underline">
                  {contact.merchant.name}
                </Link>
              </p>
              {contact.email ? (
                <p className="flex items-center gap-2">
                  <MailIcon className="text-muted-foreground size-4" />
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                </p>
              ) : null}
              {contact.phone ? (
                <p className="flex items-center gap-2">
                  <PhoneIcon className="text-muted-foreground size-4" />
                  {formatPhone(contact.phone)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deals ({contact.deals.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {contact.deals.length === 0 ? (
                <p className="text-muted-foreground">No deals linked to this contact.</p>
              ) : (
                contact.deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
                  >
                    <span className="font-medium">{deal.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {formatMoney(deal.value, deal.currency)}
                      </span>
                      <DealStageBadge stage={deal.stage} />
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <ActivityTimeline
            activities={activities}
            entityType="CONTACT"
            entityId={contact.id}
            revalidatePath={`/contacts/${contact.id}`}
            canContribute={contact.access.canEdit}
            currentUserId={user.id}
            currentUserIsAdmin={isAdmin(user)}
          />
        </div>
      </div>
    </div>
  );
}
