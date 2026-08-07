import type { Metadata } from "next";
import Link from "next/link";

import { LeadRowActions } from "@/app/(app)/leads/lead-row-actions";
import { PlusIcon, TargetIcon } from "lucide-react";

import { ExportButton } from "@/components/csv/export-button";
import { EmptyState } from "@/components/list/empty-state";
import { FlashToast } from "@/components/list/flash-toast";
import { Pagination } from "@/components/list/pagination";
import { ParamSelect } from "@/components/list/param-select";
import { SearchInput } from "@/components/list/search-input";
import { SortableHead } from "@/components/list/sortable-head";
import { ScoreBadge } from "@/components/score-badge";
import { LeadStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/datetime";
import { requireUser } from "@/lib/rbac";
import { leadListParamsSchema } from "@/lib/validators/lead";
import { listLeads } from "@/services/leads";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const rawParams = await searchParams;
  const parsed = leadListParamsSchema.safeParse(rawParams);
  const params = parsed.success ? parsed.data : leadListParamsSchema.parse({});

  const { items, total, page, pageCount } = await listLeads(user, params);

  const tableParams = {
    q: params.q,
    status: params.status,
    scope: params.scope === "all" ? undefined : params.scope,
    sort: params.sort,
    dir: params.dir,
  };

  return (
    <div className="flex flex-col gap-4">
      <FlashToast message="Lead created" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm">
            Rule-scored prospects — claim unassigned ones from the public form
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            entity="leads"
            filters={{ q: params.q, status: params.status, scope: tableParams.scope }}
          />
          <Button asChild>
            <Link href="/leads/new">
              <PlusIcon /> New lead
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search name, company, email…" />
        <ParamSelect
          param="scope"
          placeholder="All leads"
          className="w-40"
          options={[
            { value: "mine", label: "My leads" },
            { value: "unassigned", label: "Unassigned" },
          ]}
        />
        <ParamSelect
          param="status"
          placeholder="All statuses"
          className="w-40"
          options={[
            { value: "NEW", label: "New" },
            { value: "CONTACTED", label: "Contacted" },
            { value: "QUALIFIED", label: "Qualified" },
            { value: "UNQUALIFIED", label: "Unqualified" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={TargetIcon}
          title="No leads found"
          description={
            params.q || params.status || params.scope !== "all"
              ? "Try adjusting your search or filters."
              : "Create a lead or share the public capture form."
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/leads/new">
                <PlusIcon /> New lead
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card className="py-0">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Lead</TableHead>
                    <SortableHead label="Score" sortKey="score" basePath="/leads" searchParams={tableParams} />
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Owner</TableHead>
                    <SortableHead label="Created" sortKey="createdAt" basePath="/leads" searchParams={tableParams} />
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((lead) => (
                    // `relative` anchors the stretched link below, so the whole
                    // row opens the lead. The name alone used to be the only
                    // way in, and it read as plain text.
                    <TableRow key={lead.id} className="hover:bg-muted/50 relative transition-colors">
                      <TableCell className="pl-4">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium after:absolute after:inset-0 hover:underline"
                        >
                          {lead.company ?? lead.merchant?.name ?? lead.name ?? "Unnamed lead"}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {lead.name ?? "—"}
                          {lead.email ? ` · ${lead.email}` : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={lead.score} />
                      </TableCell>
                      <TableCell>
                        <LeadStatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="capitalize">
                          {lead.source.toLowerCase().replace("_", " ")}
                        </span>
                        {lead.affiliate ? (
                          <p className="text-xs">via {lead.affiliate.name}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.owner ? (
                          lead.owner.id === user.id ? (
                            "You"
                          ) : (
                            lead.owner.name
                          )
                        ) : (
                          <Badge variant="outline">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(lead.createdAt)}
                      </TableCell>
                      <TableCell className="pr-4">
                        <LeadRowActions
                          leadId={lead.id}
                          canClaim={lead.ownerId === null}
                          company={lead.company}
                          converted={lead.merchantId !== null}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            basePath="/leads"
            searchParams={tableParams}
          />
        </>
      )}
    </div>
  );
}
