import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { DealsBoard } from "@/app/(app)/deals/board";
import { ExportButton } from "@/components/csv/export-button";
import { FlashToast } from "@/components/list/flash-toast";
import { ParamSelect } from "@/components/list/param-select";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/rbac";
import { dealBoardParamsSchema } from "@/lib/validators/deal";
import { getDealsBoard } from "@/services/deals";

export const metadata: Metadata = { title: "Deals" };

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = dealBoardParamsSchema.safeParse(raw);
  const { scope } = parsed.success ? parsed.data : { scope: "all" as const };

  const { deals, summaries } = await getDealsBoard(user, scope);

  const open = summaries.filter((s) => !["WON", "LOST"].includes(s.stage));
  const openMvr = open.reduce((sum, s) => sum + s.totalMvr, 0);
  const openUsd = open.reduce((sum, s) => sum + s.totalUsd, 0);
  const openCount = open.reduce((sum, s) => sum + s.count, 0);
  const won = summaries.find((s) => s.stage === "WON");

  const stats = [
    { label: "Open deals", value: String(openCount) },
    { label: "Open pipeline (MVR)", value: money(openMvr, "MVR") },
    { label: "Open pipeline (USD)", value: money(openUsd, "USD") },
    {
      label: "Won",
      value: [
        won && won.totalMvr > 0 ? money(won.totalMvr, "MVR") : null,
        won && won.totalUsd > 0 ? money(won.totalUsd, "USD") : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FlashToast message="Deal created" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="text-muted-foreground text-sm">
            Drag deals across stages — dropping on Lost asks for a reason
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            entity="deals"
            filters={{ scope: scope === "all" ? undefined : scope }}
          />
          <ParamSelect
            param="scope"
            placeholder="Everyone's deals"
            className="w-44"
            options={[{ value: "mine", label: "My deals" }]}
          />
          <Button asChild>
            <Link href="/deals/new">
              <PlusIcon /> New deal
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{stat.label}</CardDescription>
              <CardTitle className="text-lg tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <DealsBoard deals={deals} summaries={summaries} />
    </div>
  );
}
