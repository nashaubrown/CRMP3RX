"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { moveDevTicketAction } from "@/app/(app)/dev/actions";
import {
  PriorityChip,
  ProductBadge,
  STATUS_LABELS,
  STATUS_ORDER,
  TypeBadge,
  type TicketPriority,
  type TicketProduct,
  type TicketStatus,
  type TicketType,
} from "@/components/dev/ticket-bits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type BoardTicket = {
  id: string;
  number: number;
  title: string;
  type: TicketType;
  product: TicketProduct;
  priority: TicketPriority;
  status: TicketStatus;
  assigneeName: string | null;
  merchantName: string | null;
};

// Board interaction is a status dropdown per card rather than drag-and-drop:
// it works identically on the phone a rep files bugs from, and a move is a
// deliberate one-tap statement, not a gesture to fumble.
function TicketCard({ ticket }: { ticket: BoardTicket }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function move(status: string) {
    if (status === ticket.status) return;
    startTransition(async () => {
      const res = await moveDevTicketAction(ticket.id, status);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "bg-card relative flex flex-col gap-1.5 rounded-lg border p-2.5 surface-card",
        pending && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/dev/${ticket.id}`}
          className="min-w-0 hover:underline"
          // Stretched link: the whole card opens the ticket except the select.
        >
          <span className="text-muted-foreground font-mono text-[11px]">PERX-{ticket.number}</span>
          <p className="text-sm leading-snug font-medium">{ticket.title}</p>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TypeBadge type={ticket.type} />
        <ProductBadge product={ticket.product} />
        <PriorityChip priority={ticket.priority} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground truncate text-[11px]">
          {ticket.assigneeName ?? "Unassigned"}
          {ticket.merchantName ? ` · ${ticket.merchantName}` : ""}
        </p>
        <Select value={ticket.status} onValueChange={move} disabled={pending}>
          <SelectTrigger size="sm" className="h-6 w-[118px] px-2 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function DevBoard({ tickets }: { tickets: BoardTicket[] }) {
  const columns = STATUS_ORDER.map((status) => ({
    status,
    tickets: tickets.filter((t) => t.status === status),
  }));

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid min-w-[1080px] grid-cols-6 gap-3">
        {columns.map((col) => (
          <div key={col.status} className="flex flex-col gap-2">
            <p className="text-muted-foreground flex items-center justify-between text-xs font-medium tracking-wide uppercase">
              {STATUS_LABELS[col.status]}
              <span className="font-mono">{col.tickets.length}</span>
            </p>
            <div className="bg-muted/30 flex min-h-24 flex-col gap-2 rounded-lg border p-2">
              {col.tickets.map((t) => (
                <TicketCard key={t.id} ticket={t} />
              ))}
              {col.tickets.length === 0 ? (
                <p className="text-muted-foreground/60 py-4 text-center text-xs">Empty</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
