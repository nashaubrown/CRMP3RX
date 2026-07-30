"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { OwnerBreakdownRow, OwnerBreakdownTotals } from "@/services/dashboard";

type SortKey = "ownerName" | "prospect" | "active" | "churned" | "total" | "onboarded" | "mrrMvr" | "churn";

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function churnRate(r: { churned: number; total: number }) {
  return r.total > 0 ? r.churned / r.total : 0;
}

// Tiny inline sparkline — new merchants per week. Flat line when there's no
// movement so the column stays visually consistent.
function Sparkline({ series }: { series: number[] }) {
  const w = 64;
  const h = 18;
  const max = Math.max(1, ...series);
  const n = series.length;
  const step = n > 1 ? w / (n - 1) : w;
  const points = series
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  const hasData = series.some((v) => v > 0);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={hasData ? "text-primary" : "text-muted-foreground/40"}
      />
    </svg>
  );
}

export function OwnerBreakdownTable({
  rows,
  totals,
  currency,
}: {
  rows: OwnerBreakdownRow[];
  totals: OwnerBreakdownTotals;
  currency: string;
}) {
  const [sort, setSort] = useState<SortKey>("total");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggle(key: SortKey) {
    if (key === sort) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setDir(key === "ownerName" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp: number;
    if (sort === "ownerName") cmp = a.ownerName.localeCompare(b.ownerName);
    else if (sort === "churn") cmp = churnRate(a) - churnRate(b);
    else cmp = a[sort] - b[sort];
    if (cmp === 0) cmp = b.total - a.total || a.ownerName.localeCompare(b.ownerName);
    return dir === "asc" ? cmp : -cmp;
  });

  const teamChurn = churnRate(totals);

  const sortHead = (label: string, sortKey: SortKey, className?: string, color?: string) => {
    const active = sort === sortKey;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggle(sortKey)}
          className={cn(
            "hover:text-foreground inline-flex items-center gap-1",
            active ? "text-foreground font-medium" : "",
            color
          )}
        >
          {label}
          {active ? (
            dir === "asc" ? (
              <ArrowUpIcon className="size-3" />
            ) : (
              <ArrowDownIcon className="size-3" />
            )
          ) : null}
        </button>
      </TableHead>
    );
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {sortHead("Owner", "ownerName", "pl-6")}
            {sortHead("Prospect", "prospect", "text-right", "text-blue-700 dark:text-blue-300")}
            {sortHead("Active", "active", "text-right", "text-emerald-700 dark:text-emerald-300")}
            {sortHead("Churned", "churned", "text-right", "text-red-700 dark:text-red-300")}
            {sortHead("Total", "total", "text-right")}
            {sortHead("Onboarded", "onboarded", "text-right")}
            {sortHead("Churn %", "churn", "text-right")}
            <TableHead className="text-right">Trend</TableHead>
            {sortHead("MRR", "mrrMvr", "pr-6 text-right")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => {
            const link = (status: string) => `/merchants?owner=${row.ownerId}&status=${status}`;
            const numCell = (n: number, status: string, colorClass?: string) => (
              <TableCell className="text-right tabular-nums">
                {n > 0 ? (
                  <Link href={link(status)} className={cn("hover:underline", colorClass)}>
                    {n}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
            );
            const rate = churnRate(row);
            const allProspect = row.total > 0 && row.prospect === row.total;
            return (
              <TableRow key={row.ownerId}>
                <TableCell className="pl-6 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Link href={`/merchants?owner=${row.ownerId}`} className="hover:underline">
                      {row.ownerName}
                    </Link>
                    {allProspect ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-blue-500/15 text-[10px] text-blue-700 dark:text-blue-300"
                        title="Every merchant is still a prospect — none onboarded yet"
                      >
                        All prospect
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                {numCell(row.prospect, "PROSPECT")}
                {numCell(row.active, "ACTIVE")}
                {numCell(row.churned, "CHURNED")}
                <TableCell className="text-right font-medium tabular-nums">{row.total}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.onboarded > 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-300">{row.onboarded}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    rate >= 0.25
                      ? "text-red-700 dark:text-red-300"
                      : "text-muted-foreground"
                  )}
                >
                  {row.total > 0 ? `${Math.round(rate * 100)}%` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex justify-end">
                    <Sparkline series={row.series} />
                  </span>
                </TableCell>
                <TableCell className="pr-6 text-right tabular-nums">
                  {row.mrrMvr > 0 ? money(row.mrrMvr, currency) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {rows.length > 1 ? (
          <TableFooter>
            <TableRow>
              <TableCell className="pl-6 font-medium">Team</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{totals.prospect}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{totals.active}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{totals.churned}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{totals.total}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{totals.onboarded}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {totals.total > 0 ? `${Math.round(teamChurn * 100)}%` : "—"}
              </TableCell>
              <TableCell />
              <TableCell className="pr-6 text-right font-medium tabular-nums">
                {money(totals.mrrMvr, currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
