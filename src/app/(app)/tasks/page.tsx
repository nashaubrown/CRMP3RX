import type { Metadata } from "next";
import Link from "next/link";
import { CheckSquareIcon } from "lucide-react";
import { z } from "zod";

import { TaskCompleteToggle } from "@/app/(app)/tasks/task-row-actions";
import { EmptyState } from "@/components/list/empty-state";
import { ParamSelect } from "@/components/list/param-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { isAdmin, requireUser } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { listTasks } from "@/services/tasks";

export const metadata: Metadata = { title: "Tasks" };

const paramsSchema = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
  status: z.enum(["open", "done", "all"]).default("open"),
});

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = paramsSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : paramsSchema.parse({});

  const tasks = await listTasks(user, filters);
  const now = new Date();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground text-sm">
          Tasks and meetings logged on your records — add them from any merchant, contact or deal
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {isAdmin(user) ? (
          <ParamSelect
            param="scope"
            placeholder="My tasks"
            className="w-36"
            options={[{ value: "all", label: "Everyone's" }]}
          />
        ) : null}
        <ParamSelect
          param="status"
          placeholder="Open"
          className="w-36"
          options={[
            { value: "done", label: "Completed" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquareIcon}
          title="No tasks here"
          description="Add a task from any record's activity timeline."
        />
      ) : (
        <Card className="py-2">
          <CardContent className="flex flex-col divide-y px-4">
            {tasks.map((task) => {
              const overdue = !task.completedAt && task.dueAt !== null && task.dueAt < now;
              return (
                <div key={task.id} className="flex items-start gap-3 py-3">
                  <div className="pt-0.5">
                    <TaskCompleteToggle taskId={task.id} completed={Boolean(task.completedAt)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        task.completedAt && "text-muted-foreground line-through"
                      )}
                    >
                      {task.subject}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <Link href={task.entityHref} className="hover:underline">
                        {task.entityLabel}
                      </Link>
                      {filters.scope === "all" ? <> · {task.ownerName}</> : null}
                    </p>
                    {task.body ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">{task.body}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="secondary" className="capitalize">
                      {task.type.toLowerCase()}
                    </Badge>
                    {task.dueAt ? (
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          overdue ? "text-destructive font-medium" : "text-muted-foreground"
                        )}
                      >
                        {overdue ? "Overdue · " : "Due "}
                        {formatDateTime(task.dueAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
