import Link from "next/link";
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Sparkline } from "@/components/dashboard/sparkline";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTrend = {
  label: string;
  value: string;
  href: string;
  series: number[];
  // Human-readable delta, e.g. "3 new" or "MVR 22,000"
  deltaText: string;
  // this-week vs last-week for the arrow/colour
  direction: "up" | "down" | "flat";
};

const dirClasses: Record<StatTrend["direction"], string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
};

export function StatTrendCard({ stat }: { stat: StatTrend }) {
  const Icon =
    stat.direction === "up" ? TrendingUpIcon : stat.direction === "down" ? TrendingDownIcon : MinusIcon;

  return (
    <Link href={stat.href}>
      <Card className="surface-interactive h-full gap-2 p-4">
        <span className="text-muted-foreground text-xs">{stat.label}</span>
        <span className="text-xl font-semibold tracking-tight tabular-nums">{stat.value}</span>
        <div className="mt-1 flex items-end justify-between gap-2">
          <span className={cn("flex items-center gap-1 text-xs font-medium tabular-nums", dirClasses[stat.direction])}>
            <Icon className="size-3.5" />
            {stat.deltaText}
            <span className="text-muted-foreground font-normal">this week</span>
          </span>
          <Sparkline series={stat.series} />
        </div>
      </Card>
    </Link>
  );
}
