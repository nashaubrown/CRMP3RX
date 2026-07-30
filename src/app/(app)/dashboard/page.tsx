import Link from "next/link";
import { CalendarIcon, CheckSquareIcon, MailIcon, MessageSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MrrForecast } from "@/components/dashboard/mrr-forecast";
import { StatTrendCard, type StatTrend } from "@/components/dashboard/stat-trend-card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { isAdmin, ownerScope, requireUser } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { listChangesToMyMerchants } from "@/services/audit-log";
import { getBilling } from "@/services/billing";
import { getDashboardTrends, getOwnerBreakdown, type Trend } from "@/services/dashboard";
import { getDealsBoard } from "@/services/deals";
import { merchantMineWhere } from "@/services/merchant-access";
import { listDueToday, listRecentComms } from "@/services/tasks";

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const OPEN_STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] as const;
const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const scope = ownerScope(user);
  const mine = admin ? {} : merchantMineWhere(user);

  const [merchantCount, leadCount, board, dueToday, recentComms, feed, trends, billing, ownerBreakdown] =
    await Promise.all([
      db.merchant.count({ where: mine }),
      db.lead.count({ where: { ...scope, status: { in: ["NEW", "CONTACTED"] } } }),
      getDealsBoard(user, admin ? "all" : "mine"),
      listDueToday(user),
      listRecentComms(user),
      listChangesToMyMerchants(user),
      getDashboardTrends(user),
      getBilling(user),
      getOwnerBreakdown(),
    ]);

  const open = board.summaries.filter((s) => OPEN_STAGES.includes(s.stage as never));
  const openMvr = open.reduce((sum, s) => sum + s.totalMvr, 0);
  const openUsd = open.reduce((sum, s) => sum + s.totalUsd, 0);
  const openCount = open.reduce((sum, s) => sum + s.count, 0);
  const maxCount = Math.max(1, ...open.map((s) => s.count));

  // Direction/label for a "new this week vs last week" delta.
  function delta(t: Trend, fmt: (n: number) => string) {
    const direction: StatTrend["direction"] =
      t.thisWeek > t.prevWeek ? "up" : t.thisWeek < t.prevWeek ? "down" : "flat";
    return { deltaText: fmt(t.thisWeek), direction, series: t.series };
  }

  const stats: StatTrend[] = [
    {
      label: "My merchants",
      value: String(merchantCount),
      href: "/merchants?scope=mine",
      ...delta(trends.merchants, (n) => `${n} new`),
    },
    {
      label: "Open deals",
      value: String(openCount),
      href: "/deals",
      ...delta(trends.deals, (n) => `${n} new`),
    },
    {
      label: "Open pipeline",
      value: `${money(openMvr, "MVR")}${openUsd > 0 ? ` · ${money(openUsd, "USD")}` : ""}`,
      href: "/deals",
      ...delta(trends.pipelineMvr, (n) => (n > 0 ? `+${money(n, "MVR")}` : "MVR 0")),
    },
    {
      label: "Active leads",
      value: String(leadCount),
      href: "/leads?scope=mine",
      ...delta(trends.leads, (n) => `${n} new`),
    },
  ];

  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">
          {admin ? "Team-wide view" : "Your book of business"} · {formatDateTime(now, "EEEE, d MMMM")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatTrendCard key={stat.label} stat={stat} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Monthly billing (MRR){admin ? "" : " — your merchants"}
          </CardTitle>
          <CardDescription>
            Recurring subscription revenue from Active, loyalty-live merchants.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {money(billing.totalMrr, billing.currency)}
            </span>
            <span className="text-muted-foreground text-sm">
              / month · {billing.merchantCount} merchant{billing.merchantCount === 1 ? "" : "s"}
            </span>
          </div>

          {/* Real headline figures derived from the data. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="bg-muted/40 rounded-lg border p-2">
              <p className="text-muted-foreground text-xs">Annual run-rate</p>
              <p className="font-semibold tabular-nums">{money(billing.arrMvr, "MVR")}</p>
            </div>
            <div className="bg-muted/40 rounded-lg border p-2">
              <p className="text-muted-foreground text-xs">Avg / merchant</p>
              <p className="font-semibold tabular-nums">{money(billing.arpaMvr, "MVR")}</p>
            </div>
            <div className="bg-muted/40 rounded-lg border p-2">
              <p className="text-muted-foreground text-xs">
                Pipeline upside · {billing.pipelineCount}
              </p>
              <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                +{money(billing.pipelineMrr, "MVR")}/mo
              </p>
            </div>
          </div>

          {billing.lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No billable merchants yet — set a merchant to Active with a plan and loyalty live.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {billing.lines.map((l) => (
                <div key={l.plan} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{l.plan}</span>
                    <span className="text-muted-foreground text-xs">
                      {money(l.unitPriceMvr, "MVR")}
                      {l.perLocation ? " / location" : ""} · {l.count} merchant
                      {l.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="tabular-nums">{money(l.subtotalMvr, "MVR")}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            <p className="mb-2 text-sm font-medium">12-month projection</p>
            <MrrForecast
              currentMrr={billing.totalMrr}
              defaultArpa={billing.arpaMvr || billing.avgPlanPriceMvr}
              currency={billing.currency}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Merchants by owner</CardTitle>
          <CardDescription>
            How each rep&apos;s book breaks down by status. Tap a number to open that list.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {ownerBreakdown.rows.length === 0 ? (
            <p className="text-muted-foreground px-6 text-sm">No merchants yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Owner</TableHead>
                    <TableHead className="text-right text-blue-700 dark:text-blue-300">
                      Prospect
                    </TableHead>
                    <TableHead className="text-right text-emerald-700 dark:text-emerald-300">
                      Active
                    </TableHead>
                    <TableHead className="text-right text-red-700 dark:text-red-300">
                      Churned
                    </TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Onboarded</TableHead>
                    <TableHead className="pr-6 text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownerBreakdown.rows.map((row) => {
                    const link = (status: string) =>
                      `/merchants?owner=${row.ownerId}&status=${status}`;
                    const cell = (n: number, status: string, className?: string) => (
                      <TableCell className={cn("text-right tabular-nums", className)}>
                        {n > 0 ? (
                          <Link href={link(status)} className="hover:underline">
                            {n}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    );
                    return (
                      <TableRow key={row.ownerId}>
                        <TableCell className="pl-6 font-medium">
                          <Link
                            href={`/merchants?owner=${row.ownerId}`}
                            className="hover:underline"
                          >
                            {row.ownerName}
                          </Link>
                        </TableCell>
                        {cell(row.prospect, "PROSPECT")}
                        {cell(row.active, "ACTIVE")}
                        {cell(row.churned, "CHURNED")}
                        <TableCell className="text-right font-medium tabular-nums">
                          {row.total}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.onboarded > 0 ? (
                            <span className="text-emerald-700 dark:text-emerald-300">
                              {row.onboarded}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">
                          {row.mrrMvr > 0 ? money(row.mrrMvr, ownerBreakdown.currency) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {ownerBreakdown.rows.length > 1 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="pl-6 font-medium">Team</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {ownerBreakdown.totals.prospect}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {ownerBreakdown.totals.active}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {ownerBreakdown.totals.churned}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {ownerBreakdown.totals.total}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {ownerBreakdown.totals.onboarded}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium tabular-nums">
                        {money(ownerBreakdown.totals.mrrMvr, ownerBreakdown.currency)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline by stage</CardTitle>
            <CardDescription>{admin ? "All open deals" : "Your open deals"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {open.map((s) => (
              <div key={s.stage} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{STAGE_LABELS[s.stage]}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {s.count} deal{s.count === 1 ? "" : "s"}
                    {s.totalMvr > 0 ? ` · ${money(s.totalMvr, "MVR")}` : ""}
                    {s.totalUsd > 0 ? ` · ${money(s.totalUsd, "USD")}` : ""}
                  </span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${(s.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <Link href="/deals" className="text-muted-foreground text-xs underline">
              Open the board →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquareIcon className="size-4" /> On your plate today
            </CardTitle>
            <CardDescription>Due or overdue tasks, plus today&apos;s meetings.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {dueToday.activities.length === 0 && dueToday.meetings.length === 0 ? (
              <p className="text-muted-foreground">Nothing due — go find some merchants! 🏝️</p>
            ) : (
              <>
                {dueToday.activities.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <Link href={a.entity.href} className="min-w-0 truncate hover:underline">
                      {a.subject}
                      <span className="text-muted-foreground"> · {a.entity.label}</span>
                    </Link>
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        a.overdue ? "text-destructive font-medium" : "text-muted-foreground"
                      )}
                    >
                      {a.overdue ? "Overdue" : formatTime(a.dueAt)}
                    </span>
                  </div>
                ))}
                {dueToday.meetings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <CalendarIcon className="text-muted-foreground mr-1 inline size-3.5" />
                      {m.bookerName}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatTime(m.startAt)}
                    </span>
                  </div>
                ))}
              </>
            )}
            <Link href="/tasks" className="text-muted-foreground text-xs underline">
              All tasks →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent communications</CardTitle>
            <CardDescription>Your latest emails and SMS.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {recentComms.length === 0 ? (
              <p className="text-muted-foreground">Nothing sent yet.</p>
            ) : (
              recentComms.map((c) => (
                <div key={`${c.channel}-${c.id}`} className="flex items-center gap-2">
                  {c.channel === "EMAIL" ? (
                    <MailIcon className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <MessageSquareIcon className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{c.summary}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                    {c.status.toLowerCase()}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Changes by others to your merchants</CardTitle>
            <CardDescription>
              {admin ? "Latest team activity across all accounts." : "Keep an eye on shared work."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing yet — when a teammate changes one of your records, it shows up here.
              </p>
            ) : (
              <ol className="flex flex-col gap-2 text-sm">
                {feed.map((event) => (
                  <li key={event.id} className="flex flex-col gap-0.5">
                    <span>
                      <span className="font-medium">{event.actorName}</span> {event.title}
                      {" · "}
                      <Link href={`/merchants/${event.merchantId}`} className="hover:underline">
                        <span className="font-medium">{event.merchantName}</span>
                      </Link>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
