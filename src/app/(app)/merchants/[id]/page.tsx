import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";

import { deleteMerchantAction } from "@/app/(app)/merchants/actions";
import { ShareDialog } from "@/app/(app)/merchants/share-dialog";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { DeleteButton } from "@/components/delete-button";
import { DealStageBadge, MerchantStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { isAdmin, requireUser } from "@/lib/rbac";
import { listActivitiesForEntity } from "@/services/activities";
import { listMerchantHistory } from "@/services/audit-log";
import { getMerchant } from "@/services/merchants";
import { listTeamMembers } from "@/services/users";
import { HistoryCard } from "@/components/history/history-card";
import { serializeEvents } from "@/components/history/serialize";

export const metadata: Metadata = { title: "Merchant" };

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const merchant = await getMerchant(user, id);
  if (!merchant) notFound();

  const [activities, team, history] = await Promise.all([
    listActivitiesForEntity(user, "MERCHANT", id),
    merchant.access.canManageShares ? listTeamMembers() : Promise.resolve([]),
    merchant.access.canViewHistory ? listMerchantHistory(user, id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{merchant.name}</h1>
            <MerchantStatusBadge status={merchant.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {merchant.category ?? "Uncategorized"} · owned by {merchant.owner.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {merchant.access.canManageShares ? (
            <ShareDialog
              merchantId={merchant.id}
              ownerId={merchant.owner.id}
              ownerName={merchant.owner.name}
              team={team}
              shares={merchant.shares.map((s) => ({
                userId: s.userId,
                permission: s.permission,
              }))}
            />
          ) : null}
          {merchant.access.canEdit ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/merchants/${merchant.id}/edit`}>
                <PencilIcon /> Edit
              </Link>
            </Button>
          ) : null}
          {merchant.access.canDelete ? (
            <DeleteButton
              action={deleteMerchantAction.bind(null, merchant.id)}
              title={`Delete ${merchant.name}?`}
              description="This permanently deletes the merchant along with its contacts and deals. This cannot be undone."
            />
          ) : null}
        </div>
      </div>

      {merchant.shares.length > 0 ? (
        <p className="text-muted-foreground -mt-2 flex items-center gap-1.5 text-xs">
          <UsersIcon className="size-3.5" />
          Shared with{" "}
          {merchant.shares
            .map((s) => `${s.user.name} (${s.permission.toLowerCase()})`)
            .join(", ")}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {merchant.email ? (
                  <p className="flex items-center gap-2">
                    <MailIcon className="text-muted-foreground size-4" />
                    <a href={`mailto:${merchant.email}`} className="hover:underline">
                      {merchant.email}
                    </a>
                  </p>
                ) : null}
                {merchant.phone ? (
                  <p className="flex items-center gap-2">
                    <PhoneIcon className="text-muted-foreground size-4" />
                    {formatPhone(merchant.phone)}
                  </p>
                ) : null}
                {merchant.website ? (
                  <p className="flex items-center gap-2">
                    <GlobeIcon className="text-muted-foreground size-4" />
                    <a
                      href={merchant.website}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {merchant.website}
                    </a>
                  </p>
                ) : null}
                {merchant.address ? (
                  <p className="flex items-center gap-2">
                    <MapPinIcon className="text-muted-foreground size-4" />
                    {merchant.address}
                  </p>
                ) : null}
                {!merchant.email && !merchant.phone && !merchant.website && !merchant.address ? (
                  <p className="text-muted-foreground">No contact details yet.</p>
                ) : null}
                {merchant.notes ? (
                  <p className="text-muted-foreground border-t pt-2 whitespace-pre-wrap">
                    {merchant.notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Perx fields</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">POS system</span>
                  <span>{merchant.posSystem ?? "—"}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Monthly txn volume</span>
                  <span>{merchant.monthlyTxnVolume?.toLocaleString() ?? "—"}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-muted-foreground">Loyalty program</span>
                  {merchant.loyaltyLive ? (
                    <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      Live
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not live</Badge>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Contacts ({merchant.contacts.length})</CardTitle>
              {merchant.access.canEdit ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/contacts/new?merchantId=${merchant.id}`}>
                    <PlusIcon /> Add contact
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {merchant.contacts.length === 0 ? (
                <p className="text-muted-foreground">No contacts yet.</p>
              ) : (
                merchant.contacts.map((contact) => (
                  <Link
                    key={contact.id}
                    href={`/contacts/${contact.id}`}
                    className="hover:bg-muted/60 -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">
                        {contact.firstName} {contact.lastName}
                      </span>
                      {contact.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}
                    </span>
                    <span className="text-muted-foreground">{contact.title ?? ""}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deals ({merchant.deals.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {merchant.deals.length === 0 ? (
                <p className="text-muted-foreground">No deals yet — deals ship in Phase 2.</p>
              ) : (
                merchant.deals.map((deal) => (
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
          {merchant.access.canViewHistory ? (
            <HistoryCard
              events={serializeEvents(history)}
              description="Every change on this account — fields, contacts, sharing and activity log. Visible to the owner and admins only."
            />
          ) : null}
        </div>

        <div>
          <ActivityTimeline
            activities={activities}
            entityType="MERCHANT"
            entityId={merchant.id}
            revalidatePath={`/merchants/${merchant.id}`}
            canContribute={merchant.access.canEdit}
            currentUserId={user.id}
            currentUserIsAdmin={isAdmin(user)}
          />
        </div>
      </div>
    </div>
  );
}
