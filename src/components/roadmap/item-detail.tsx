"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon, SendIcon, StoreIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  addRoadmapCommentAction,
  addRoadmapDemandAction,
  createLinkedTicketAction,
  deleteRoadmapItemAction,
  linkTicketAction,
  removeRoadmapDemandAction,
  setRoadmapStageAction,
  unlinkTicketAction,
  updateRoadmapItemAction,
} from "@/app/(app)/roadmap/actions";
import { PRODUCT_LABELS, StatusBadge, type TicketStatus } from "@/components/dev/ticket-bits";
import { ProgressBar, STAGE_LABELS, STAGE_ORDER } from "@/components/roadmap/roadmap-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NONE = "__none__";

export type ItemDetailData = {
  id: string;
  title: string;
  description: string | null;
  stage: string;
  product: "MERCHANT_PORTAL" | "PERX_APP" | "CRM";
  effort: string | null;
  impact: string | null;
  suggestedByName: string;
  canDelete: boolean;
  demands: { id: string; merchantId: string; merchantName: string; note: string | null }[];
  tickets: { id: string; number: number; title: string; status: TicketStatus }[];
  comments: { id: string; body: string; authorName: string; at: string }[];
  progress: { done: number; total: number };
};

function save(itemId: string, item: ItemDetailData, patch: Record<string, string | null>) {
  return updateRoadmapItemAction(itemId, {
    title: item.title,
    description: item.description ?? "",
    product: item.product,
    effort: item.effort ?? "",
    impact: item.impact ?? "",
    ...patch,
  });
}

function ScoreSelect({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Select
        value={value ?? NONE}
        disabled={pending}
        onValueChange={(v) =>
          startTransition(async () => {
            const res = await onSave(v === NONE ? "" : v);
            if (res.error) toast.error(res.error);
            else router.refresh();
          })
        }
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Unset</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function ItemDetail({
  item,
  merchants,
  linkableTickets,
}: {
  item: ItemDetailData;
  merchants: { id: string; name: string }[];
  linkableTickets: { id: string; number: number; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [comment, setComment] = React.useState("");
  const [demandMerchant, setDemandMerchant] = React.useState(NONE);
  const [demandNote, setDemandNote] = React.useState("");
  const [linkPick, setLinkPick] = React.useState(NONE);
  const [addingTicket, setAddingTicket] = React.useState(false);

  const run = (fn: () => Promise<{ error: string | null }>, ok?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col gap-5">
        {item.description ? (
          <div className="rounded-lg border p-3">
            <p className="text-sm whitespace-pre-wrap">{item.description}</p>
          </div>
        ) : null}

        {/* Merchant demand — the reason this exists in a CRM */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Merchants who asked ({item.demands.length})
          </p>
          {item.demands.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5">
              <div className="min-w-0">
                <Link
                  href={`/merchants/${d.merchantId}`}
                  className="flex items-center gap-1.5 text-sm font-medium hover:underline"
                >
                  <StoreIcon className="size-3.5" /> {d.merchantName}
                </Link>
                {d.note ? (
                  <p className="text-muted-foreground text-xs italic">“{d.note}”</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label="Remove"
                disabled={pending}
                onClick={() => run(() => removeRoadmapDemandAction(item.id, d.id))}
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={demandMerchant} onValueChange={setDemandMerchant}>
              <SelectTrigger size="sm" className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Add a merchant…</SelectItem>
                {merchants.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={demandNote}
              onChange={(e) => setDemandNote(e.target.value)}
              placeholder="What they said (optional)"
              className="h-8 flex-1 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || demandMerchant === NONE}
              onClick={() =>
                run(
                  () =>
                    addRoadmapDemandAction(item.id, {
                      merchantId: demandMerchant,
                      note: demandNote,
                    }),
                  "Demand recorded"
                )
              }
            >
              Add
            </Button>
          </div>
        </div>

        {/* Linked work */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Build ({item.tickets.length} tickets)</p>
            {item.progress.total > 0 ? (
              <div className="w-40">
                <ProgressBar done={item.progress.done} total={item.progress.total} />
              </div>
            ) : null}
          </div>
          {item.tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
              <Link href={`/dev/${t.id}`} className="min-w-0 truncate text-sm hover:underline">
                <span className="text-muted-foreground font-mono text-[11px]">PERX-{t.number}</span>{" "}
                {t.title}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusBadge status={t.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Unlink"
                  disabled={pending}
                  onClick={() => run(() => unlinkTicketAction(item.id, t.id))}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {addingTicket ? (
              <form
                className="flex flex-1 flex-wrap items-center gap-2"
                action={(fd: FormData) =>
                  run(
                    () =>
                      createLinkedTicketAction(item.id, {
                        title: fd.get("title"),
                        type: "FEATURE",
                        product: item.product,
                        priority: "MEDIUM",
                      }),
                    "Ticket filed and linked"
                  )
                }
              >
                <Input
                  name="title"
                  required
                  autoFocus
                  placeholder={`e.g. ${item.title} — portal UI`}
                  className="h-8 flex-1 text-sm"
                />
                <Button size="sm" type="submit" disabled={pending}>
                  File
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setAddingTicket(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setAddingTicket(true)}>
                  <PlusIcon className="size-3.5" /> New ticket for this
                </Button>
                {linkableTickets.length > 0 ? (
                  <Select
                    value={linkPick}
                    onValueChange={(v) => {
                      setLinkPick(NONE);
                      if (v !== NONE) run(() => linkTicketAction(item.id, v), "Ticket linked");
                    }}
                  >
                    <SelectTrigger size="sm" className="w-56">
                      <SelectValue placeholder="Link an existing ticket…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Link an existing ticket…</SelectItem>
                      {linkableTickets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          PERX-{t.number} · {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* Discussion */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Discussion ({item.comments.length})</p>
          {item.comments.map((c) => (
            <div key={c.id} className="rounded-lg border p-2.5">
              <p className="text-muted-foreground text-xs">
                <span className="text-foreground font-medium">{c.authorName}</span> · {c.at}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          <div className="flex items-start gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Why this matters, scope thoughts, pushback…"
              rows={2}
              className="flex-1"
            />
            <Button
              size="sm"
              disabled={pending || !comment.trim()}
              onClick={() =>
                run(async () => {
                  const res = await addRoadmapCommentAction(item.id, { body: comment });
                  if (!res.error) setComment("");
                  return res;
                })
              }
            >
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Meta rail */}
      <div className="flex h-fit flex-col gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">Stage</Label>
          <Select
            value={item.stage}
            disabled={pending}
            onValueChange={(v) => run(() => setRoadmapStageAction(item.id, v))}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">Product</Label>
          <Select
            value={item.product}
            disabled={pending}
            onValueChange={(v) => run(() => save(item.id, item, { product: v }))}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRODUCT_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScoreSelect
          label="Impact"
          value={item.impact}
          onSave={(v) => save(item.id, item, { impact: v })}
        />
        <ScoreSelect
          label="Effort"
          value={item.effort}
          onSave={(v) => save(item.id, item, { effort: v })}
        />
        <p className="text-muted-foreground text-xs">Suggested by {item.suggestedByName}</p>
        {item.canDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive justify-start"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete “${item.title}”? Decline keeps the history instead.`)) return;
              startTransition(async () => {
                const res = await deleteRoadmapItemAction(item.id);
                if (res.error) toast.error(res.error);
                else router.push("/roadmap");
              });
            }}
          >
            <Trash2Icon className="size-3.5" /> Delete idea
          </Button>
        ) : null}
      </div>
    </div>
  );
}
