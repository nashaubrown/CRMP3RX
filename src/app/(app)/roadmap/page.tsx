import type { Metadata } from "next";
import Link from "next/link";
import { LightbulbIcon, PlusIcon, StoreIcon } from "lucide-react";

import {
  ProgressBar,
  STAGE_LABELS,
  STAGE_ORDER,
  type RoadmapStage,
} from "@/components/roadmap/roadmap-meta";
import { VoteButton } from "@/components/roadmap/roadmap-bits";
import { ProductBadge } from "@/components/dev/ticket-bits";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/rbac";
import { devProductSchema } from "@/lib/validators/dev-ticket";
import { listRoadmapItems, ticketProgress } from "@/services/roadmap";

export const metadata: Metadata = { title: "Roadmap" };

// The idea's story, stage by stage. Work status is never typed in here —
// In-development items carry a progress bar rolled up from their dev tickets.
export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const product = devProductSchema.safeParse(params.product);

  const items = await listRoadmapItems({
    product: product.success ? product.data : undefined,
  });

  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    items: items.filter((i) => i.stage === stage),
  })).filter((g) => g.items.length > 0 || (g.stage !== "DECLINED" && g.stage !== "SHIPPED"));

  const shippedCount = items.filter((i) => i.stage === "SHIPPED").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roadmap</h1>
          <p className="text-muted-foreground text-sm">
            Feature ideas for the Merchant Portal, Perx App and CRM — vote, attach the merchants
            who asked, and follow the build.
            {shippedCount > 0 ? ` ${shippedCount} shipped so far.` : ""}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/roadmap/new">
            <PlusIcon className="size-4" /> Suggest a feature
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border py-14 text-center text-sm">
          <LightbulbIcon className="size-6" />
          <p className="text-foreground font-medium">No ideas yet</p>
          <p>Heard a merchant wish for something? Put it here before it&apos;s forgotten.</p>
        </div>
      ) : null}

      {byStage.map(({ stage, items: group }) => (
        <section key={stage} className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {STAGE_LABELS[stage as RoadmapStage]}
            <span className="ml-2 font-mono">{group.length}</span>
          </h2>
          {group.length === 0 ? (
            <p className="text-muted-foreground/60 rounded-lg border border-dashed px-3 py-3 text-xs">
              Nothing here yet.
            </p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {group.map((item) => {
                const progress = ticketProgress(item.tickets);
                return (
                  <div
                    key={item.id}
                    className="surface-card bg-card relative flex gap-3 rounded-lg border p-3"
                  >
                    <VoteButton
                      itemId={item.id}
                      count={item.votes.length}
                      voted={item.votes.some((v) => v.userId === user.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/roadmap/${item.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ProductBadge product={item.product} />
                        {item.demands.length > 0 ? (
                          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                            <StoreIcon className="size-3" />
                            {item.demands.length} merchant{item.demands.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {item._count.comments > 0 ? (
                          <span className="text-muted-foreground text-[11px]">
                            {item._count.comments} comment{item._count.comments === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {stage === "IN_DEVELOPMENT" ? (
                        <div className="mt-2">
                          <ProgressBar done={progress.done} total={progress.total} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
