import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon, PencilIcon, PlusIcon } from "lucide-react";

import { EmptyState } from "@/components/list/empty-state";
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
import { listTemplates } from "@/services/templates";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  await requireUser();
  const templates = await listTemplates();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Templates</h1>
          <p className="text-muted-foreground text-sm">
            Reusable email and SMS messages with merge vars
          </p>
        </div>
        <Button asChild>
          <Link href="/templates/new">
            <PlusIcon /> New template
          </Link>
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No templates yet"
          description="Create reusable messages your team can send from any record."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subject / preview</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="pl-4 font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant={template.channel === "EMAIL" ? "secondary" : "outline"}>
                        {template.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate">
                      {template.subject ?? template.body.slice(0, 80)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="stamp">{formatDate(template.updatedAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/templates/${template.id}/edit`}>
                          <PencilIcon /> Edit
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
