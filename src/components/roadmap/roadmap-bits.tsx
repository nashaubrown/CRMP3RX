"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronUpIcon } from "lucide-react";
import { toast } from "sonner";

import { toggleRoadmapVoteAction } from "@/app/(app)/roadmap/actions";
import { cn } from "@/lib/utils";

// The upvote chevron. Filled when you're among the voters; one tap toggles.
// Lives alone in this client module — the rest of the roadmap vocabulary is
// server-safe in roadmap-meta.tsx.
export function VoteButton({
  itemId,
  count,
  voted,
}: {
  itemId: string;
  count: number;
  voted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={voted}
      aria-label={voted ? "Remove your vote" : "Vote for this"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          const res = await toggleRoadmapVoteAction(itemId);
          if (res.error) toast.error(res.error);
          else router.refresh();
        });
      }}
      className={cn(
        "flex min-w-10 flex-col items-center rounded-lg border px-2 py-1 transition-colors",
        voted
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-primary hover:text-primary",
        pending && "opacity-60"
      )}
    >
      <ChevronUpIcon className="size-4" />
      <span className="text-xs font-semibold tabular-nums">{count}</span>
    </button>
  );
}
