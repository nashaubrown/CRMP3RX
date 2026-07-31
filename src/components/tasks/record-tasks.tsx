"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteTaskAction, toggleTaskAction } from "@/app/(app)/tasks/actions";
import { TaskDialog, type UiTask } from "@/components/tasks/task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const priorityStyles: Record<UiTask["priority"], string> = {
  HIGH: "bg-red-500/15 text-red-700 dark:text-red-300",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  LOW: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

// Tasks attached to a merchant/contact/deal, shown on its detail page. Creating
// here pre-links the task to the record.
export function RecordTasks({
  kind,
  recordId,
  tasks,
  team,
  currentUserId,
  revalidate,
}: {
  kind: "merchant" | "contact" | "deal";
  recordId: string;
  tasks: UiTask[];
  team: { id: string; name: string }[];
  currentUserId: string;
  revalidate: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UiTask | null>(null);

  const presetLink = { [`${kind}Id`]: recordId } as {
    merchantId?: string;
    contactId?: string;
    dealId?: string;
  };

  function run(fn: () => Promise<{ error: string | null }>, ok?: string) {
    fn().then((res) => {
      if (res.error) toast.error(res.error);
      else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tasks yet.</p>
      ) : (
        <div className="divide-y">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-2.5 py-2">
              <Checkbox
                checked={t.done}
                onCheckedChange={() => run(() => toggleTaskAction(t.id, revalidate), t.done ? "Reopened" : "Completed")}
                className="mt-0.5"
                aria-label={t.done ? "Reopen" : "Complete"}
              />
              <button
                type="button"
                onClick={() => {
                  setEditing(t);
                  setDialogOpen(true);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <p className={cn("text-sm", t.done && "text-muted-foreground line-through")}>{t.title}</p>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">{t.assigneeName}</span>
                  {t.dueLabel ? (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        t.overdue ? "text-destructive font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t.overdue ? "Overdue · " : "Due "}
                      {t.dueLabel}
                    </span>
                  ) : null}
                </span>
              </button>
              <Badge
                variant="outline"
                className={cn("border-transparent capitalize", priorityStyles[t.priority])}
              >
                {t.priority.toLowerCase()}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="Task actions">
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(t);
                      setDialogOpen(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => run(() => deleteTaskAction(t.id, revalidate), "Task deleted")}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon /> Add task
        </Button>
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        team={team}
        merchants={[]}
        defaultAssigneeId={currentUserId}
        revalidate={revalidate}
        lockLink
        presetLink={presetLink}
      />
    </div>
  );
}
