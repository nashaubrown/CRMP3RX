import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";

import { EmptyState } from "@/components/list/empty-state";
import { Pagination } from "@/components/list/pagination";
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
    sort: params.sort,
    dir: params.dir,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground text-sm">People at your merchant accounts</p>
        </div>
        <Button asChild>
          <Link href="/contacts/new">
            <PlusIcon /> New contact
          </Link>
        </Button>
      </div>

      <SearchInput placeholder="Search name, email, title, merchant…" />

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
