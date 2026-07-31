import type { Metadata } from "next";
import Link from "next/link";
import { KanbanSquareIcon, ListIcon } from "lucide-react";

import { TasksClient } from "@/components/tasks/tasks-client";
import type { UiTask } from "@/components/tasks/task-dialog";
import { ParamSelect } from "@/components/list/param-select";
import { SearchInput } from "@/components/list/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { toUiTask } from "@/lib/task-ui";
import { taskListParamsSchema } from "@/lib/validators/task";
import { getTaskStats, listTasks } from "@/services/tasks";
import { listTeamMembers } from "@/services/users";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = taskListParamsSchema.safeParse(raw);
  const params = parsed.success ? parsed.data : taskListParamsSchema.parse({});

  // The board shows every status column, so ignore the open/done filter there.
  const effectiveParams = params.view === "board" ? { ...params, status: "all" as const } : params;

  const [items, stats, team, merchants] = await Promise.all([
    listTasks(user, effectiveParams),
    getTaskStats(user, params),
    listTeamMembers(),
    db.merchant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);

  const now = new Date();
  const tasks: UiTask[] = items.map((t) => toUiTask(t, now));

  // Toggle links that preserve the other query params.
  const toggleHref = (key: string, value: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) if (v) sp.set(k, v);
    sp.set(key, value);
    return `/tasks?${sp.toString()}`;
  };

  const statTiles = [
    { label: "Open", value: stats.open },
    { label: "Overdue", value: stats.overdue, tone: "text-red-700 dark:text-red-300" },
    { label: "Due today", value: stats.dueToday, tone: "text-amber-700 dark:text-amber-300" },
    { label: "Done this week", value: stats.doneThisWeek, tone: "text-emerald-700 dark:text-emerald-300" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground text-sm">
            Track your team&apos;s to-dos — create, prioritise, assign, and move them across stages
          </p>
        </div>
        <div className="bg-muted inline-flex rounded-md p-0.5 text-sm">
          <Button asChild variant={params.view === "list" ? "secondary" : "ghost"} size="sm" className="h-7">
            <Link href={toggleHref("view", "list")}>
              <ListIcon /> List
            </Link>
          </Button>
          <Button asChild variant={params.view === "board" ? "secondary" : "ghost"} size="sm" className="h-7">
            <Link href={toggleHref("view", "board")}>
              <KanbanSquareIcon /> Board
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statTiles.map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="flex flex-col gap-0.5 px-4 py-3">
              <span className="text-muted-foreground text-xs">{s.label}</span>
              <span className={`text-2xl font-semibold tabular-nums ${s.tone ?? ""}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search tasks…" />
        <ParamSelect
          param="scope"
          placeholder="Everyone's"
          className="w-36"
          options={[{ value: "mine", label: "My tasks" }]}
        />
        <ParamSelect
          param="assignee"
          placeholder="Any assignee"
          className="w-40"
          options={team.map((m) => ({ value: m.id, label: m.name }))}
        />
        <ParamSelect
          param="priority"
          placeholder="Any priority"
          className="w-36"
          options={[
            { value: "HIGH", label: "High" },
            { value: "MEDIUM", label: "Medium" },
            { value: "LOW", label: "Low" },
          ]}
        />
        {params.view === "list" ? (
          <ParamSelect
            param="status"
            placeholder="Open"
            className="w-32"
            options={[
              { value: "done", label: "Completed" },
              { value: "all", label: "All" },
            ]}
          />
        ) : null}
        {params.view === "list" ? (
          <div className="bg-muted ml-auto inline-flex rounded-md p-0.5 text-xs">
            <Button asChild variant={params.group === "due" ? "secondary" : "ghost"} size="sm" className="h-7">
              <Link href={toggleHref("group", "due")}>By due</Link>
            </Button>
            <Button
              asChild
              variant={params.group === "assignee" ? "secondary" : "ghost"}
              size="sm"
              className="h-7"
            >
              <Link href={toggleHref("group", "assignee")}>By assignee</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <TasksClient
        tasks={tasks}
        view={params.view}
        group={params.group}
        team={team.map((m) => ({ id: m.id, name: m.name }))}
        merchants={merchants}
        currentUserId={user.id}
      />
    </div>
  );
}
