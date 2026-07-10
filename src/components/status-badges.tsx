import type { DealStage, LeadStatus, MerchantStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const merchantStatusStyles: Record<MerchantStatus, string> = {
  PROSPECT: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
  CHURNED: "bg-red-500/15 text-red-700 dark:text-red-300 border-transparent",
};

export function MerchantStatusBadge({ status }: { status: MerchantStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", merchantStatusStyles[status])}>
      {status.toLowerCase()}
    </Badge>
  );
}

const leadStatusStyles: Record<LeadStatus, string> = {
  NEW: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent",
  CONTACTED: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
  QUALIFIED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
  UNQUALIFIED: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-transparent",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", leadStatusStyles[status])}>
      {status.toLowerCase()}
    </Badge>
  );
}

const dealStageStyles: Record<DealStage, string> = {
  NEW: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent",
  QUALIFIED: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-transparent",
  PROPOSAL: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-transparent",
  NEGOTIATION: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
  WON: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
  LOST: "bg-red-500/15 text-red-700 dark:text-red-300 border-transparent",
};

export function DealStageBadge({ stage }: { stage: DealStage }) {
  return (
    <Badge variant="outline" className={cn("capitalize", dealStageStyles[stage])}>
      {stage.toLowerCase()}
    </Badge>
  );
}
