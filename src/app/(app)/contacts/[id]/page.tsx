import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildingIcon, MailIcon, PencilIcon, PhoneIcon } from "lucide-react";

import { deleteContactAction } from "@/app/(app)/contacts/actions";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { DeleteButton } from "@/components/delete-button";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { DealStageBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { isAdmin, requireUser } from "@/lib/rbac";
import { toUiTask } from "@/lib/task-ui";
import { listActivitiesForEntity } from "@/services/activities";
import { listContactHistory } from "@/services/audit-log";
import { getContact } from "@/services/contacts";
import { buildMergeVars, listCommunicationsForEntity } from "@/services/messaging";
import { hasCalendarConnected } from "@/services/scheduling";
import { listTemplates } from "@/services/templates";
import { listTasksForRecord } from "@/services/tasks";
import { listTeamMembers } from "@/services/users";
import { RecordTasks } from "@/components/tasks/record-tasks";
import { ComposeButtons } from "@/components/compose/compose-buttons";
import { ScheduleMeetingDialog } from "@/components/scheduling/schedule-meeting-dialog";
import { CommunicationsCard } from "@/components/compose/communications-card";
import { HistoryCard } from "@/components/history/history-card";
import { serializeEvents } from "@/components/history/serialize";

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

  const [activities, history, comms, templates, mergeVars, calendarConnected, taskItems, team] =
    await Promise.all([
      listActivitiesForEntity(user, "CONTACT", id),
      contact.access.canViewHistory
        ? listContactHistory(user, id, contact.merchantId)
        : Promise.resolve([]),
      listCommunicationsForEntity(user, "CONTACT", id),
      contact.access.canEdit ? listTemplates() : Promise.resolve([]),
      contact.access.canEdit ? buildMergeVars(user, "CONTACT", id) : Promise.resolve({}),
      contact.access.canEdit ? hasCalendarConnected(user.id) : Promise.resolve(false),
      listTasksForRecord("contact", id),
      listTeamMembers(),
    ]);

  const now = new Date();
  const tasks = taskItems.map((t) => toUiTask(t, now));

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Contacts", href: "/contacts" },
          { label: `${contact.firstName} ${contact.lastName}` },
        ]}
      />
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
          <div className="flex flex-wrap gap-2">
            <ComposeButtons
              entityType="CONTACT"
              entityId={contact.id}
              revalidatePath={`/contacts/${contact.id}`}
              emails={
                contact.email
                  ? [{ label: `${contact.firstName} ${contact.lastName} <${contact.email}>`, value: contact.email }]
                  : []
              }
              phones={
                contact.phone
                  ? [{ label: `${contact.firstName} ${contact.lastName} (${contact.phone})`, value: contact.phone }]
                  : []
              }
              templates={templates}
              mergeVars={mergeVars}
            />
            <ScheduleMeetingDialog
              entityType="CONTACT"
              entityId={contact.id}
              revalidatePath={`/contacts/${contact.id}`}
              defaultTitle={`Perx × ${contact.firstName} ${contact.lastName}`}
              calendarConnected={calendarConnected}
              attendees={
                contact.email
                  ? [
                      {
                        name: `${contact.firstName} ${contact.lastName}`,
                        email: contact.email,
                        phone: contact.phone,
                      },
                    ]
                  : []
              }
            />
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
                <Badge variant="outline" className="text-[10px]">
                  Home
                </Badge>
              </p>
              {contact.merchantLinks.filter((l) => l.merchantId !== contact.merchantId).length > 0 ? (
                <p className="flex flex-wrap items-center gap-1.5 pl-6">
                  <span className="text-muted-foreground text-xs">Also tagged to:</span>
                  {contact.merchantLinks
                    .filter((l) => l.merchantId !== contact.merchantId)
                    .map((l) => (
                      <Link key={l.merchantId} href={`/merchants/${l.merchant.id}`}>
                        <Badge variant="secondary" className="hover:bg-secondary/70">
                          {l.merchant.name}
                        </Badge>
                      </Link>
                    ))}
                </p>
              ) : null}
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
              <CardTitle className="text-base">Tasks ({tasks.length})</CardTitle>
              <CardDescription>To-dos for this contact. Also appear in the Tasks tracker.</CardDescription>
            </CardHeader>
            <CardContent>
              <RecordTasks
                kind="contact"
                recordId={contact.id}
                tasks={tasks}
                team={team.map((m) => ({ id: m.id, name: m.name }))}
                currentUserId={user.id}
                revalidate={`/contacts/${contact.id}`}
              />
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

          <CommunicationsCard items={comms} />

          {contact.access.canViewHistory ? (
            <HistoryCard
              events={serializeEvents(history)}
              description="Every change to this contact. Visible to the merchant's owner and admins only."
            />
          ) : null}
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
