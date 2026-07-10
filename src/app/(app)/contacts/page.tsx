import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";

import { ExportButton } from "@/components/csv/export-button";
import { ImportDialog } from "@/components/csv/import-dialog";
import { EmptyState } from "@/components/list/empty-state";
import { Pagination } from "@/components/list/pagination";
import { ParamSelect } from "@/components/list/param-select";
import { SearchInput } from "@/components/list/search-input";
import { SortableHead } from "@/components/list/sortable-head";
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
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/rbac";
import { contactListParamsSchema } from "@/lib/validators/contact";
import { listContacts } from "@/services/contacts";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const rawParams = await searchParams;
  const parsed = contactListParamsSchema.safeParse(rawParams);
  const params = parsed.success ? parsed.data : contactListParamsSchema.parse({});

  const { items, total, page, pageCount } = await listContacts(user, params);

  const tableParams = {
    q: params.q,
    merchantId: params.merchantId,
    scope: params.scope === "all" ? undefined : params.scope,
    sort: params.sort,
    dir: params.dir,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground text-sm">
            People at merchant accounts — filter to your own or shared merchants
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            entity="contacts"
            filters={{ q: params.q, merchantId: params.merchantId, scope: tableParams.scope }}
          />
          <ImportDialog
            entity="contacts"
            revalidatePath="/contacts"
            columnsHint="firstName, lastName, merchant (or merchantId), title, email, phone, isPrimary"
          />
          <Button asChild>
            <Link href="/contacts/new">
              <PlusIcon /> New contact
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search name, email, title, merchant…" />
        <ParamSelect
          param="scope"
          placeholder="All contacts"
          className="w-44"
          options={[
            { value: "mine", label: "My merchants'" },
            { value: "shared", label: "Shared with me" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No contacts found"
          description={
            params.q ? "Try adjusting your search." : "Add your first contact to get started."
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/contacts/new">
                <PlusIcon /> New contact
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
                    <SortableHead label="Name" sortKey="name" basePath="/contacts" searchParams={tableParams} className="pl-4" />
                    <TableHead>Title</TableHead>
                    <SortableHead label="Merchant" sortKey="merchant" basePath="/contacts" searchParams={tableParams} />
                    <TableHead>Owner</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="pl-4 font-medium">
                        <Link href={`/contacts/${contact.id}`} className="hover:underline">
                          {contact.firstName} {contact.lastName}
                        </Link>
                        {contact.isPrimary ? (
                          <Badge variant="secondary" className="ml-2">
                            Primary
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/merchants/${contact.merchant.id}`}
                          className="hover:underline"
                        >
                          {contact.merchant.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.merchant.ownerId === user.id ? (
                          "You"
                        ) : contact.merchant.shares.some((s) => s.userId === user.id) ? (
                          <span className="flex items-center gap-1.5">
                            {contact.merchant.owner.name}
                            <Badge variant="secondary">Shared</Badge>
                          </span>
                        ) : (
                          contact.merchant.owner.name
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.phone ? formatPhone(contact.phone) : "—"}
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
            basePath="/contacts"
            searchParams={tableParams}
          />
        </>
      )}
    </div>
  );
}
