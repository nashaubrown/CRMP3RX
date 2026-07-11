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
import { StatTrendCard, type StatTrend } from "@/components/dashboard/stat-trend-card";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { isAdmin, ownerScope, requireUser } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { listChangesToMyMerchants } from "@/services/audit-log";
import { getDashboardTrends, type Trend } from "@/services/dashboard";
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

  const [merchantCount, leadCount, board, dueToday, recentComms, feed, trends] = await Promise.all([
    db.merchant.count({ where: mine }),
    db.lead.count({ where: { ...scope, status: { in: ["NEW", "CONTACTED"] } } }),
    getDealsBoard(user, admin ? "all" : "mine"),
    listDueToday(user),
    listRecentComms(user),
    listChangesToMyMerchants(user),
    getDashboardTrends(user),
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
