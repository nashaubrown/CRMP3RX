import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NewTicketForm } from "@/components/dev/ticket-form";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage() {
  await requireUser();
  const [people, merchants] = await Promise.all([
    db.user.findMany({
      where: { disabledAt: null },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    db.merchant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={[{ label: "Dev", href: "/dev" }, { label: "New ticket" }]} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New ticket</h1>
        <p className="text-muted-foreground text-sm">
          A good ticket answers three things: what happened, where, and how to see it yourself.
        </p>
      </div>
      <NewTicketForm people={people} merchants={merchants} />
    </div>
  );
}
