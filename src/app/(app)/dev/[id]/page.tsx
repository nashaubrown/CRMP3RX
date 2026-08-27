import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { TicketDetail } from "@/components/dev/ticket-detail";
import { StatusBadge, TypeBadge } from "@/components/dev/ticket-bits";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/rbac";
import { formatDateTime } from "@/lib/datetime";
import { getDevTicket, listDevTicketHistory, ticketKey } from "@/services/dev-tickets";

export const metadata: Metadata = { title: "Ticket" };

// Renders an audit row as a sentence. The diff shapes are our own (see
// dev-tickets.ts), so this stays a small lookup rather than a parser.
function historyLine(action: string, diff: unknown): string {
  const d = (diff ?? {}) as Record<string, unknown>;
  switch (action) {
    case "dev_ticket.create":
      return "filed the ticket";
    case "dev_ticket.status":
      return `moved it from ${d.from} to ${d.to}`;
    case "dev_ticket.update":
      return "edited the ticket";
    case "dev_ticket.comment":
      return "commented";
    default:
      return action.replace("dev_ticket.", "");
  }
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [ticket, history, people, merchants] = await Promise.all([
    getDevTicket(id),
    listDevTicketHistory(id),
    db.user.findMany({
      where: { disabledAt: null },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    db.merchant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!ticket) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[{ label: "Dev", href: "/dev" }, { label: ticketKey(ticket.number) }]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground font-mono text-sm">{ticketKey(ticket.number)}</span>
        <h1 className="text-xl font-semibold tracking-tight">{ticket.title}</h1>
        <TypeBadge type={ticket.type} />
        <StatusBadge status={ticket.status} />
      </div>

      <TicketDetail
        ticket={{
          id: ticket.id,
          number: ticket.number,
          title: ticket.title,
          description: ticket.description,
          type: ticket.type,
          product: ticket.product,
          priority: ticket.priority,
          status: ticket.status,
          reporter: { id: ticket.reporter.id, name: ticket.reporter.name },
          assigneeId: ticket.assigneeId,
          merchantId: ticket.merchantId,
          merchantName: ticket.merchant?.name ?? null,
          canDelete: isAdmin(user) || ticket.reporterId === user.id,
          comments: ticket.comments.map((c) => ({
            id: c.id,
            body: c.body,
            authorName: c.author.name,
            at: formatDateTime(c.createdAt),
          })),
          attachments: ticket.attachments,
          history: history.map((h) => ({
            id: h.id,
            line: historyLine(h.action, h.diff),
            actor: h.actor?.name ?? "Someone",
            at: formatDateTime(h.createdAt),
          })),
        }}
        people={people}
        merchants={merchants}
      />
    </div>
  );
}
