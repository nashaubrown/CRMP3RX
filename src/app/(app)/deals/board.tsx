"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { DealStage } from "@prisma/client";
import { GripVerticalIcon, LockIcon } from "lucide-react";
import { toast } from "sonner";

import { moveDealAction } from "@/app/(app)/deals/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BoardDeal, StageSummary } from "@/services/deals";
import { cn } from "@/lib/utils";

// A dot per stage rather than a saturated stripe across the top of every
// column: the colour is a label, and six full-strength stripes made the board
// louder than the deals on it.
const STAGES: { stage: DealStage; label: string; accent: string }[] = [
  { stage: "NEW", label: "New", accent: "bg-blue-500" },
  { stage: "QUALIFIED", label: "Qualified", accent: "bg-cyan-500" },
  { stage: "PROPOSAL", label: "Proposal", accent: "bg-violet-500" },
  { stage: "NEGOTIATION", label: "Negotiation", accent: "bg-amber-500" },
  { stage: "WON", label: "Won", accent: "bg-emerald-500" },
  { stage: "LOST", label: "Lost", accent: "bg-red-500" },
];

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function DealCard({ deal, dragging }: { deal: BoardDeal; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    disabled: !deal.canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-card flex flex-col gap-1 rounded-md border p-3 shadow-xs",
        isDragging && "opacity-40",
        dragging && "rotate-2 shadow-lg"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`/deals/${deal.id}`}
          className="text-sm leading-tight font-medium hover:underline"
        >
          {deal.title}
        </Link>
        {deal.canEdit ? (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Drag ${deal.title}`}
            className="text-muted-foreground -m-1 shrink-0 cursor-grab touch-none p-1 active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" />
          </button>
        ) : (
          <LockIcon className="text-muted-foreground/50 size-3.5 shrink-0" />
        )}
      </div>
      <p className="text-muted-foreground text-xs">{deal.merchantName}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {money(deal.value, deal.currency)}
        </span>
        <span className="text-muted-foreground text-xs">{deal.ownerName.split(" ")[0]}</span>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  label,
  accent,
  deals,
  summary,
}: {
  stage: DealStage;
  label: string;
  accent: string;
  deals: BoardDeal[];
  summary?: StageSummary;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-card/50 flex min-w-48 flex-1 basis-0 flex-col gap-2 rounded-xl border p-2.5",
        isOver && "ring-ring ring-2"
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <span className={cn("size-2 shrink-0 rounded-full", accent)} aria-hidden />
        <span className="text-[13px] font-semibold">{label}</span>
        <Badge variant="secondary" className="ml-auto">
          {deals.length}
        </Badge>
      </div>
      {summary && (summary.totalMvr > 0 || summary.totalUsd > 0) ? (
        <p className="text-muted-foreground px-1 text-xs tabular-nums">
          {[
            summary.totalMvr > 0 ? money(summary.totalMvr, "MVR") : null,
            summary.totalUsd > 0 ? money(summary.totalUsd, "USD") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      <div className="flex min-h-24 flex-col gap-2">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}

export function DealsBoard({
  deals: initialDeals,
  summaries,
}: {
  deals: BoardDeal[];
  summaries: StageSummary[];
}) {
  const router = useRouter();
  const [deals, setDeals] = React.useState(initialDeals);
  const [activeDeal, setActiveDeal] = React.useState<BoardDeal | null>(null);
  // Deal reference survives the close animation (title would flash empty otherwise)
  const [lostDeal, setLostDeal] = React.useState<BoardDeal | null>(null);
  const [lostOpen, setLostOpen] = React.useState(false);
  const [lostReason, setLostReason] = React.useState("");
  const [, startTransition] = React.useTransition();

  // Sync local optimistic state when the server sends fresh data (React's
  // recommended render-time adjustment, not an effect).
  const [prevInitial, setPrevInitial] = React.useState(initialDeals);
  if (prevInitial !== initialDeals) {
    setPrevInitial(initialDeals);
    setDeals(initialDeals);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  function commitMove(deal: BoardDeal, stage: DealStage, reason?: string) {
    const previous = deals;
    setDeals((current) => current.map((d) => (d.id === deal.id ? { ...d, stage } : d)));
    startTransition(async () => {
      const result = await moveDealAction({ dealId: deal.id, stage, lostReason: reason });
      if (result.error) {
        setDeals(previous);
        toast.error(result.error);
      } else {
        toast.success(
          stage === "WON" ? "Deal won 🎉" : stage === "LOST" ? "Deal marked lost" : "Deal moved"
        );
        router.refresh();
      }
    });
  }

  function onDragStart(event: DragStartEvent) {
    setActiveDeal(deals.find((d) => d.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;
    const deal = deals.find((d) => d.id === active.id);
    const stage = over.id as DealStage;
    if (!deal || deal.stage === stage) return;

    if (stage === "LOST") {
      setLostReason("");
      setLostDeal(deal);
      setLostOpen(true);
      return;
    }
    commitMove(deal, stage);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
          {STAGES.map(({ stage, label, accent }) => (
            <StageColumn
              key={stage}
              stage={stage}
              label={label}
              accent={accent}
              deals={deals.filter((d) => d.stage === stage)}
              summary={summaries.find((s) => s.stage === stage)}
            />
          ))}
        </div>
        <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} dragging /> : null}</DragOverlay>
      </DndContext>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark &ldquo;{lostDeal?.title}&rdquo; as lost?</DialogTitle>
            <DialogDescription>
              A reason is required — it feeds the pipeline reports.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lostReason">Lost reason</Label>
            <Textarea
              id="lostReason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              rows={2}
              placeholder="e.g. Chose a competitor; budget cut; no POS integration"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!lostReason.trim()}
              onClick={() => {
                if (lostDeal) commitMove(lostDeal, "LOST", lostReason.trim());
                setLostOpen(false);
              }}
            >
              Mark lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
