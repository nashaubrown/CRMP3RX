import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Small shared chips for tickets, kept server-renderable (no hooks).

export type TicketType = "BUG" | "FEATURE" | "IMPROVEMENT";
export type TicketProduct = "MERCHANT_PORTAL" | "PERX_APP" | "CRM";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "TESTING" | "DONE" | "WONT_DO";

export const TYPE_LABELS: Record<TicketType, string> = {
  BUG: "Bug",
  FEATURE: "Feature",
  IMPROVEMENT: "Improvement",
};

export const PRODUCT_LABELS: Record<TicketProduct, string> = {
  MERCHANT_PORTAL: "Merchant Portal",
  PERX_APP: "Perx App",
  CRM: "CRM",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  TESTING: "Testing",
  DONE: "Done",
  WONT_DO: "Won't do",
};

export const STATUS_ORDER: TicketStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
  "WONT_DO",
];

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function TypeBadge({ type }: { type: TicketType }) {
  const cls =
    type === "BUG"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : type === "FEATURE"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return <Badge className={cn("border-transparent text-[10px]", cls)}>{TYPE_LABELS[type]}</Badge>;
}

export function ProductBadge({ product }: { product: TicketProduct }) {
  return (
    <Badge variant="outline" className="text-[10px]">
      {PRODUCT_LABELS[product]}
    </Badge>
  );
}

// Priority as a dot + word, colour-graded so a column scans by temperature.
export function PriorityChip({ priority }: { priority: TicketPriority }) {
  const dot =
    priority === "URGENT"
      ? "bg-red-600"
      : priority === "HIGH"
        ? "bg-orange-500"
        : priority === "MEDIUM"
          ? "bg-amber-400"
          : "bg-slate-400";
  return (
    <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const cls =
    status === "DONE"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "WONT_DO"
        ? "bg-muted text-muted-foreground line-through"
        : status === "IN_PROGRESS"
          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
          : status === "TESTING"
            ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
            : "bg-muted text-muted-foreground";
  return <Badge className={cn("border-transparent text-[10px]", cls)}>{STATUS_LABELS[status]}</Badge>;
}
