import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Server-safe roadmap vocabulary. Deliberately NOT "use client": the board is
// a server component and needs these as real values — non-component exports
// of a client module arrive there as reference proxies and break.

export type RoadmapStage =
  | "SUGGESTED"
  | "CONSIDERING"
  | "PLANNED"
  | "IN_DEVELOPMENT"
  | "SHIPPED"
  | "DECLINED";

export const STAGE_LABELS: Record<RoadmapStage, string> = {
  SUGGESTED: "Suggested",
  CONSIDERING: "Considering",
  PLANNED: "Planned",
  IN_DEVELOPMENT: "In development",
  SHIPPED: "Shipped",
  DECLINED: "Declined",
};

export const STAGE_ORDER: RoadmapStage[] = [
  "SUGGESTED",
  "CONSIDERING",
  "PLANNED",
  "IN_DEVELOPMENT",
  "SHIPPED",
  "DECLINED",
];

export function StageBadge({ stage }: { stage: RoadmapStage }) {
  const cls =
    stage === "SHIPPED"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : stage === "IN_DEVELOPMENT"
        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
        : stage === "PLANNED"
          ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
          : stage === "DECLINED"
            ? "bg-muted text-muted-foreground line-through"
            : "bg-muted text-muted-foreground";
  return <Badge className={cn("border-transparent text-[10px]", cls)}>{STAGE_LABELS[stage]}</Badge>;
}

// Rolled-up ticket progress: a quiet bar, not a typed-in percentage.
export function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-muted-foreground text-[11px] tabular-nums">
        {done}/{total} tickets
      </span>
    </div>
  );
}
