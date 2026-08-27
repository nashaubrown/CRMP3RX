import type { Activity, EntityType } from "@prisma/client";
import {
  CalendarIcon,
  CheckSquareIcon,
  MailIcon,
  MessageSquareIcon,
  PhoneIcon,
  StickyNoteIcon,
  type LucideIcon,
} from "lucide-react";

import { ActivityItemActions } from "@/components/activity/activity-item-actions";
import { AddActivityForm } from "@/components/activity/add-activity-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const typeIcons: Record<Activity["type"], LucideIcon> = {
  NOTE: StickyNoteIcon,
  CALL: PhoneIcon,
  EMAIL: MailIcon,
  SMS: MessageSquareIcon,
  MEETING: CalendarIcon,
  TASK: CheckSquareIcon,
};

type ActivityWithOwner = Activity & { owner: { id: string; name: string } };

export function ActivityTimeline({
  activities,
  entityType,
  entityId,
  revalidatePath,
  canContribute,
  currentUserId,
  currentUserIsAdmin,
}: {
  activities: ActivityWithOwner[];
  entityType: EntityType;
  entityId: string;
  revalidatePath: string;
  canContribute: boolean;
  currentUserId: string;
  currentUserIsAdmin: boolean;
}) {
  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {canContribute ? (
          <AddActivityForm
            entityType={entityType}
            entityId={entityId}
            revalidatePath={revalidatePath}
          />
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
            View only — ask the owner for edit access to log activity here.
          </p>
        )}

        {activities.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {canContribute
              ? "No activity yet — add a note above to get started."
              : "No activity yet."}
          </p>
        ) : (
          <ol className="flex flex-col">
            {activities.map((activity, i) => {
              const Icon = typeIcons[activity.type];
              const isTask = activity.type === "TASK" || activity.type === "MEETING";
              const overdue =
                isTask && !activity.completedAt && activity.dueAt !== null && activity.dueAt < now;

              return (
                <li key={activity.id} className="group relative flex gap-3 pb-5">
                  {i < activities.length - 1 ? (
                    <span className="bg-border absolute top-8 left-[15px] h-full w-px" aria-hidden />
                  ) : null}
                  <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          activity.completedAt && isTask && "text-muted-foreground line-through"
                        )}
                      >
                        {activity.subject}
                      </span>
                      <Badge variant="secondary" className="capitalize">
                        {activity.type.toLowerCase()}
                      </Badge>
                      {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                      {activity.completedAt && isTask ? (
                        <Badge variant="outline">Done</Badge>
                      ) : null}
                    </div>
                    {activity.body ? (
                      <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                        {activity.body}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {activity.owner.name} <span className="stamp">· {formatDateTime(activity.createdAt)}</span>
                      {activity.dueAt ? <> · due {formatDateTime(activity.dueAt)}</> : null}
                    </p>
                  </div>
                  {currentUserIsAdmin || activity.owner.id === currentUserId ? (
                    <ActivityItemActions
                      activityId={activity.id}
                      isTask={isTask}
                      completed={Boolean(activity.completedAt)}
                      revalidatePath={revalidatePath}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
