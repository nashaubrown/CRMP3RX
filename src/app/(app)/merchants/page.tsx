import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, StoreIcon } from "lucide-react";

import { ExportButton } from "@/components/csv/export-button";
import { ImportDialog } from "@/components/csv/import-dialog";
import { EmptyState } from "@/components/list/empty-state";
import { Pagination } from "@/components/list/pagination";
import { ParamSelect } from "@/components/list/param-select";
import { SearchInput } from "@/components/list/search-input";
import { SortableHead } from "@/components/list/sortable-head";
import { MerchantStatusBadge } from "@/components/status-badges";
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
import { merchantListParamsSchema } from "@/lib/validators/merchant";
import { listMerchants } from "@/services/merchants";

export const metadata: Metadata = { title: "Merchants" };

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const rawParams = await searchParams;
  const parsed = merchantListParamsSchema.safeParse(rawParams);
  const params = parsed.success ? parsed.data : merchantListParamsSchema.parse({});

  const { items, total, page, pageCount } = await listMerchants(user, params);

  const tableParams = {
    q: params.q,
    status: params.status,
    scope: params.scope === "all" ? undefined : params.scope,
    sort: params.sort,
    dir: params.dir,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merchants</h1>
          <p className="text-muted-foreground text-sm">
            All merchant accounts — filter to your own or ones shared with you
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            entity="merchants"
            filters={{ q: params.q, status: params.status, scope: tableParams.scope }}
          />
          <ImportDialog
            entity="merchants"
            revalidatePath="/merchants"
            columnsHint="name, category, status, email, phone, website, address, posSystem, monthlyTxnVolume, loyaltyLive, notes"
          />
          <Button asChild>
            <Link href="/merchants/new">
              <PlusIcon /> New merchant
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search name, category, email…" />
        <ParamSelect
          param="scope"
          placeholder="All merchants"
          className="w-44"
          options={[
            { value: "mine", label: "My merchants" },
            { value: "shared", label: "Shared with me" },
          ]}
        />
        <ParamSelect
          param="status"
          placeholder="All statuses"
          className="w-40"
          options={[
            { value: "PROSPECT", label: "Prospect" },
            { value: "ACTIVE", label: "Active" },
            { value: "CHURNED", label: "Churned" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No merchants found"
          description={
            params.q || params.status
              ? "Try adjusting your search or filters."
              : "Create your first merchant to get started."
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/merchants/new">
                <PlusIcon /> New merchant
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
                    <SortableHead label="Name" sortKey="name" basePath="/merchants" searchParams={tableParams} className="pl-4" />
                    <SortableHead label="Category" sortKey="category" basePath="/merchants" searchParams={tableParams} />
                    <SortableHead label="Status" sortKey="status" basePath="/merchants" searchParams={tableParams} />
                    <TableHead>Contacts</TableHead>
                    <TableHead>Deals</TableHead>
                    <TableHead>Owner</TableHead>
                    <SortableHead label="Updated" sortKey="updatedAt" basePath="/merchants" searchParams={tableParams} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((merchant) => (
                    <TableRow key={merchant.id}>
                      <TableCell className="pl-4 font-medium">
                        <Link href={`/merchants/${merchant.id}`} className="hover:underline">
                          {merchant.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {merchant.category ?? "—"}
                      </TableCell>
                      <TableCell>
                        <MerchantStatusBadge status={merchant.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {merchant._count.contacts}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {merchant._count.deals}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {merchant.owner.id === user.id ? (
                          "You"
                        ) : merchant.shares.some((s) => s.userId === user.id) ? (
                          <span className="flex items-center gap-1.5">
                            {merchant.owner.name}
                            <Badge variant="secondary">Shared</Badge>
                          </span>
                        ) : (
                          merchant.owner.name
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(merchant.updatedAt)}
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
            basePath="/merchants"
            searchParams={tableParams}
          />
        </>
      )}
    </div>
  );
}
