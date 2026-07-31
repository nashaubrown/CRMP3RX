"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, StoreIcon, UserIcon, KanbanSquareIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteTaskAction, moveTaskAction, toggleTaskAction } from "@/app/(app)/tasks/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const priorityStyles: Record<UiTask["priority"], string> = {
  HIGH: "bg-red-500/15 text-red-700 dark:text-red-300",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  LOW: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

const bucketLabels: Record<UiTask["bucket"], string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No due date",
  done: "Done",
};
const bucketOrder: UiTask["bucket"][] = ["overdue", "today", "week", "later", "none", "done"];

function PriorityBadge({ priority }: { priority: UiTask["priority"] }) {
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", priorityStyles[priority])}>
      {priority.toLowerCase()}
    </Badge>
  );
}

function LinkChip({ link }: { link: UiTask["link"] }) {
  if (!link) return null;
  const Icon = link.kind === "merchant" ? StoreIcon : link.kind === "contact" ? UserIcon : KanbanSquareIcon;
  return (
    <Link href={link.href} className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline">
      <Icon className="size-3" />
      {link.label}
    </Link>
  );
}

export function TasksClient({
  tasks,
  view,
  group,
  team,
  merchants,
  currentUserId,
}: {
  tasks: UiTask[];
  view: "list" | "board";
  group: "due" | "assignee";
  team: { id: string; name: string }[];
  merchants: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UiTask | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(task: UiTask) {
    setEditing(task);
    setDialogOpen(true);
  }

  function runAction(fn: () => Promise<{ error: string | null }>, ok?: string) {
    fn().then((res) => {
      if (res.error) toast.error(res.error);
      else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });
  }

  const toggle = (t: UiTask) => runAction(() => toggleTaskAction(t.id), t.done ? "Reopened" : "Completed");
  const remove = (t: UiTask) => runAction(() => deleteTaskAction(t.id), "Task deleted");
  const move = (t: UiTask, status: UiTask["status"]) => runAction(() => moveTaskAction(t.id, status));

  const rowMenu = (t: UiTask) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Task actions">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEdit(t)}>Edit</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => remove(t)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ----- List view -----
  function renderList() {
    const groups: { key: string; label: string; items: UiTask[] }[] = [];
    if (group === "assignee") {
      const byId = new Map<string, UiTask[]>();
      for (const t of tasks) {
        const arr = byId.get(t.assigneeId);
        if (arr) arr.push(t);
        else byId.set(t.assigneeId, [t]);
      }
      for (const [, items] of byId) {
        groups.push({ key: items[0].assigneeId, label: items[0].assigneeName, items });
      }
      groups.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      for (const b of bucketOrder) {
        const items = tasks.filter((t) => t.bucket === b);
        if (items.length) groups.push({ key: b, label: bucketLabels[b], items });
      }
    }

    return (
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-1.5">
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
              {g.label}
              <span className="text-muted-foreground/60">{g.items.length}</span>
            </p>
            <div className="divide-y rounded-lg border">
              {g.items.map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                  <Checkbox
                    checked={t.done}
                    onCheckedChange={() => toggle(t)}
                    className="mt-0.5"
                    aria-label={t.done ? "Reopen" : "Complete"}
                  />
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className={cn("text-sm font-medium", t.done && "text-muted-foreground line-through")}>
                      {t.title}
                    </p>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <LinkChip link={t.link} />
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
                  <PriorityBadge priority={t.priority} />
                  {rowMenu(t)}
                </div>
              ))}
            </div>
          </div>
        ))}
        {tasks.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No tasks match these filters.
          </p>
        ) : null}
      </div>
    );
  }

  // ----- Board view -----
  const columns: { status: UiTask["status"]; label: string }[] = [
    { status: "TODO", label: "To do" },
    { status: "IN_PROGRESS", label: "In progress" },
    { status: "DONE", label: "Done" },
  ];

  function renderBoard() {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="bg-muted/30 flex flex-col gap-2 rounded-lg p-2">
              <p className="text-muted-foreground flex items-center justify-between px-1 text-xs font-medium tracking-wide uppercase">
                {col.label}
                <span>{items.length}</span>
              </p>
              {items.map((t) => (
                <div key={t.id} className="bg-background flex flex-col gap-2 rounded-md border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className={cn(
                        "text-left text-sm font-medium",
                        t.done && "text-muted-foreground line-through"
                      )}
                    >
                      {t.title}
                    </button>
                    {rowMenu(t)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <LinkChip link={t.link} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs">{t.assigneeName}</span>
                    {t.dueLabel ? (
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          t.overdue ? "text-destructive font-medium" : "text-muted-foreground"
                        )}
                      >
                        {t.dueLabel}
                      </span>
                    ) : null}
                  </div>
                  <Select value={t.status} onValueChange={(v) => move(t, v as UiTask["status"])}>
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODO">To do</SelectItem>
                      <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                      <SelectItem value="DONE">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {items.length === 0 ? (
                <p className="text-muted-foreground px-1 py-6 text-center text-xs">Nothing here</p>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew}>
          <PlusIcon /> New task
        </Button>
      </div>

      {view === "board" ? renderBoard() : renderList()}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        team={team}
        merchants={merchants}
        defaultAssigneeId={currentUserId}
      />
    </div>
  );
}
