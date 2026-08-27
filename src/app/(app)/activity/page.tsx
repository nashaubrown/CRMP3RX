import type { Metadata } from "next";
import Link from "next/link";
import { ActivityIcon } from "lucide-react";

import { EmptyState } from "@/components/list/empty-state";
import { ParamSelect } from "@/components/list/param-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { requireAdmin } from "@/lib/rbac";
import {
  getUserActivitySummary,
  listActivityActions,
  listActivityLog,
} from "@/services/activity-log";
import { listTeamMembers } from "@/services/users";

export const metadata: Metadata = { title: "Activity" };

// Turns "merchant.update" into something a human reads without a decoder ring.
function describeAction(action: string): string {
  const [entity, verb] = action.split(".");
  const verbs: Record<string, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    stage: "moved",
    move: "moved",
    cancel: "cancelled",
    apply: "applied",
    approve: "approved",
    tool_call: "asked Perx about",
    telegram_create: "created via Telegram",
  };
  return `${verbs[verb] ?? verb ?? ""} ${entity}`.trim();
}

function relative(date: Date | null): string {
  if (!date) return "never";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(date, "d MMM yyyy");
}

type SearchParams = Promise<{ actor?: string; action?: string; days?: string; page?: string }>;

export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;

  const days = Number(sp.days) > 0 ? Number(sp.days) : 30;
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const [log, actions, team, summary] = await Promise.all([
    listActivityLog(ctx, { actorId: sp.actor, action: sp.action, days, page }),
    listActivityActions(ctx),
    listTeamMembers(),
    getUserActivitySummary(ctx),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground text-sm">
          Who is using the CRM, and what they changed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team adoption</CardTitle>
          <CardDescription>
            Last seen updates as people use the CRM (even just reading, at 5-minute resolution);
            last sign-in is the login form itself. A &le; time means they were in before
            sign-in tracking began.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Last change</TableHead>
                  <TableHead className="text-right">Actions · 7d</TableHead>
                  <TableHead className="pr-6 text-right">Actions · 30d</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.name}</span>
                        {u.role === "ADMIN" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Admin
                          </Badge>
                        ) : null}
                        {u.disabled ? (
                          <Badge variant="outline" className="text-destructive text-[10px]">
                            Disabled
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground text-xs">{u.email}</p>
                    </TableCell>
                    <TableCell
                      className={u.lastSeenAt ? "text-muted-foreground" : "text-muted-foreground/60"}
                    >
                      {relative(u.lastSeenAt)}
                    </TableCell>
                    <TableCell
                      className={u.lastLoginAt ? "text-muted-foreground" : "text-muted-foreground/60"}
                      title={
                        u.signInPredatesTracking
                          ? "Signed in before sign-in tracking began — showing their last recorded activity instead"
                          : undefined
                      }
                    >
                      {u.lastLoginAt
                        ? relative(u.lastLoginAt)
                        : u.signInPredatesTracking
                          ? `≤ ${relative(u.lastSeenAt)}`
                          : "never"}
                    </TableCell>
                    <TableCell
                      className={u.lastActiveAt ? "text-muted-foreground" : "text-muted-foreground/60"}
                    >
                      {relative(u.lastActiveAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.actionsLast7Days}</TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {u.actionsLast30Days}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect
          param="actor"
          placeholder="Everyone"
          options={[
            { value: "", label: "Everyone" },
            ...team.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <ParamSelect
          param="action"
          placeholder="All actions"
          options={[
            { value: "", label: "All actions" },
            ...actions.map((a) => ({ value: a, label: a })),
          ]}
        />
        <ParamSelect
          param="days"
          placeholder="Last 30 days"
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
        />
      </div>

      {log.items.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="Nothing recorded"
          description="No changes match these filters in the selected period."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Did what</TableHead>
                    <TableHead className="pr-4">Record</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground pl-4 whitespace-nowrap">
                        {formatDateTime(row.createdAt, "d MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell>{row.actor?.name ?? "—"}</TableCell>
                      <TableCell>
                        <span className="capitalize">{describeAction(row.action)}</span>
                        <p className="text-muted-foreground font-mono text-[11px]">{row.action}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground pr-4">
                        {row.entityType.toLowerCase()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {log.pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {log.total} entries · page {log.page} of {log.pageCount}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild disabled={log.page <= 1}>
              <Link href={`/activity?page=${log.page - 1}&days=${days}`}>Previous</Link>
            </Button>
            <Button variant="outline" size="sm" asChild disabled={log.page >= log.pageCount}>
              <Link href={`/activity?page=${log.page + 1}&days=${days}`}>Next</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
