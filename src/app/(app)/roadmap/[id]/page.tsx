import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ProductBadge } from "@/components/dev/ticket-bits";
import { ItemDetail } from "@/components/roadmap/item-detail";
import { StageBadge, type RoadmapStage } from "@/components/roadmap/roadmap-meta";
import { VoteButton } from "@/components/roadmap/roadmap-bits";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/datetime";
import { isAdmin, requireUser } from "@/lib/rbac";
import { getRoadmapItem, ticketProgress } from "@/services/roadmap";

export const metadata: Metadata = { title: "Roadmap item" };

export default async function RoadmapItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [item, merchants, unlinked] = await Promise.all([
    getRoadmapItem(id),
    db.merchant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Tickets not yet tied to any roadmap item, newest first — the link pool.
    db.devTicket.findMany({
      where: { roadmapItemId: null, status: { notIn: ["DONE", "WONT_DO"] } },
      select: { id: true, number: true, title: true },
      orderBy: { number: "desc" },
      take: 50,
    }),
  ]);
  if (!item) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={[{ label: "Roadmap", href: "/roadmap" }, { label: item.title }]} />
      <div className="flex flex-wrap items-center gap-3">
        <VoteButton
          itemId={item.id}
          count={item.votes.length}
          voted={item.votes.some((v) => v.userId === user.id)}
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
            <StageBadge stage={item.stage as RoadmapStage} />
            <ProductBadge product={item.product} />
          </div>
          {item.shippedAt ? (
            <p className="text-muted-foreground text-sm">
              Shipped {formatDateTime(item.shippedAt, "d MMM yyyy")}
              {item.demands.length > 0
                ? ` — ${item.demands.length} merchant${item.demands.length === 1 ? "" : "s"} to tell`
                : ""}
            </p>
          ) : null}
        </div>
      </div>

      <ItemDetail
        item={{
          id: item.id,
          title: item.title,
          description: item.description,
          stage: item.stage,
          product: item.product,
          effort: item.effort,
          impact: item.impact,
          suggestedByName: item.suggestedBy.name,
          canDelete: isAdmin(user) || item.suggestedById === user.id,
          demands: item.demands.map((d) => ({
            id: d.id,
            merchantId: d.merchant.id,
            merchantName: d.merchant.name,
            note: d.note,
          })),
          tickets: item.tickets,
          comments: item.comments.map((c) => ({
            id: c.id,
            body: c.body,
            authorName: c.author.name,
            at: formatDateTime(c.createdAt),
          })),
          progress: ticketProgress(item.tickets),
        }}
        merchants={merchants}
        linkableTickets={unlinked}
      />
    </div>
  );
}
