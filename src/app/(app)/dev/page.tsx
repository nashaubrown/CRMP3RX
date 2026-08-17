import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { DevBoard, type BoardTicket } from "@/components/dev/dev-board";
import { DevFilters } from "@/components/dev/dev-filters";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/rbac";
import { devProductSchema, devTicketTypeSchema } from "@/lib/validators/dev-ticket";
import { listDevTickets } from "@/services/dev-tickets";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Dev" };

// The Dev board: tickets against the Merchant Portal, the Perx App, and the
// CRM itself. Reps file, developers work the queue, and Testing hands a fix
// back to the reporter to verify before it counts as Done.
export default async function DevPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; type?: string; mine?: string; q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const product = devProductSchema.safeParse(params.product);
  const type = devTicketTypeSchema.safeParse(params.type);

  const [tickets, people] = await Promise.all([
    listDevTickets(user, {
      product: product.success ? product.data : undefined,
      type: type.success ? type.data : undefined,
      mine: params.mine === "1",
      q: params.q?.trim() || undefined,
    }),
    db.user.findMany({
      where: { disabledAt: null, role: "DEVELOPER" },
      select: { id: true },
    }),
  ]);

  const rows: BoardTicket[] = tickets.map((t) => ({
    id: t.id,
    number: t.number,
    title: t.title,
    type: t.type,
    product: t.product,
    priority: t.priority,
    status: t.status,
    assigneeName: t.assignee?.name ?? null,
    merchantName: t.merchant?.name ?? null,
  }));

  const open = tickets.filter((t) => t.status !== "DONE" && t.status !== "WONT_DO").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dev</h1>
          <p className="text-muted-foreground text-sm">
            {open} open ticket{open === 1 ? "" : "s"} across the Merchant Portal, Perx App and CRM
            {people.length === 0
              ? " — no Developer accounts yet; add one in Team"
              : ""}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dev/new">
            <PlusIcon className="size-4" /> New ticket
          </Link>
        </Button>
      </div>

      <DevFilters />
      <DevBoard tickets={rows} />
    </div>
  );
}
