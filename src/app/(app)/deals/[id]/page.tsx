import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { BuildingIcon, CalendarIcon, PencilIcon, UserIcon } from "lucide-react";

import { deleteDealAction } from "@/app/(app)/deals/actions";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { DeleteButton } from "@/components/delete-button";
import { DealStageBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import { isAdmin, requireUser } from "@/lib/rbac";
import { toUiTask } from "@/lib/task-ui";
import { listActivitiesForEntity } from "@/services/activities";
import { getDeal } from "@/services/deals";
import { listTasksForRecord } from "@/services/tasks";
import { listTeamMembers } from "@/services/users";
import { RecordTasks } from "@/components/tasks/record-tasks";

export const metadata: Metadata = { title: "Deal" };

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const deal = await getDeal(user, id);
  if (!deal) notFound();

  const [activities, taskItems, team] = await Promise.all([
    listActivitiesForEntity(user, "DEAL", id),
    listTasksForRecord("deal", id),
    listTeamMembers(),
  ]);
  const now = new Date();
  const tasks = taskItems.map((t) => toUiTask(t, now));
  const canDelete = isAdmin(user) || deal.ownerId === user.id;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={[{ label: "Deals", href: "/deals" }, { label: deal.title }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{deal.title}</h1>
            <DealStageBadge stage={deal.stage} />
          </div>
          <p className="text-muted-foreground text-sm">
            {formatMoney(deal.value, deal.currency)} · owned by{" "}
            {deal.owner.id === user.id ? "you" : deal.owner.name}
          </p>
        </div>
        <div className="flex gap-2">
          {deal.canEdit ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/deals/${deal.id}/edit`}>
                <PencilIcon /> Edit
              </Link>
            </Button>
          ) : null}
          {canDelete ? (
            <DeleteButton
              action={deleteDealAction.bind(null, deal.id)}
              title={`Delete ${deal.title}?`}
              description="This permanently deletes the deal. This cannot be undone."
            />
          ) : null}
        </div>
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
                <Link href={`/merchants/${deal.merchant.id}`} className="hover:underline">
                  {deal.merchant.name}
                </Link>
              </p>
              {deal.contact ? (
                <p className="flex items-center gap-2">
                  <UserIcon className="text-muted-foreground size-4" />
                  <Link href={`/contacts/${deal.contact.id}`} className="hover:underline">
                    {deal.contact.firstName} {deal.contact.lastName}
                  </Link>
                </p>
              ) : null}
              {deal.expectedCloseDate ? (
                <p className="flex items-center gap-2">
                  <CalendarIcon className="text-muted-foreground size-4" />
                  Expected close: {formatDate(deal.expectedCloseDate)}
                </p>
              ) : null}
              {deal.closedAt ? (
                <p className="text-muted-foreground">
                  Closed {formatDate(deal.closedAt)}
                  {deal.lostReason ? ` — ${deal.lostReason}` : ""}
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                Change the stage by dragging the card on the{" "}
                <Link href="/deals" className="underline">
                  deals board
                </Link>
                .
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tasks ({tasks.length})</CardTitle>
              <CardDescription>To-dos for this deal. Also appear in the Tasks tracker.</CardDescription>
            </CardHeader>
            <CardContent>
              <RecordTasks
                kind="deal"
                recordId={deal.id}
                tasks={tasks}
                team={team.map((m) => ({ id: m.id, name: m.name }))}
                currentUserId={user.id}
                revalidate={`/deals/${deal.id}`}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <ActivityTimeline
            activities={activities}
            entityType="DEAL"
            entityId={deal.id}
            revalidatePath={`/deals/${deal.id}`}
            canContribute={deal.canEdit}
            currentUserId={user.id}
            currentUserIsAdmin={isAdmin(user)}
          />
        </div>
      </div>
    </div>
  );
}
