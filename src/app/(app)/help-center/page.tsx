import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon, PlusIcon, SettingsIcon } from "lucide-react";

import { EmptyState } from "@/components/list/empty-state";
import { SearchInput } from "@/components/list/search-input";
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
import { isAdmin } from "@/lib/authz";
import { requireUser } from "@/lib/rbac";
import { listHelpArticles, countInReview } from "@/services/help-center";

export const metadata: Metadata = { title: "Help Center" };

const STATUS_VARIANTS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  IN_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  ARCHIVED: "bg-muted text-muted-foreground line-through",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

type SearchParams = Promise<{ filter?: string; q?: string }>;

export default async function HelpCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { filter, q } = await searchParams;
  const admin = isAdmin(user);
  const query = q?.trim() ?? "";

  // Searching looks across every article, so a hit is never hidden by the tab
  // you happened to be on. The tabs fall back to "All" while a query is active.
  const activeFilter = query ? "" : (filter ?? "");

  const articles = await listHelpArticles(user, {
    ...(activeFilter === "mine"
      ? { mine: true }
      : activeFilter === "review"
        ? { status: "IN_REVIEW" as const }
        : activeFilter === "published"
          ? { status: "PUBLISHED" as const }
          : {}),
    ...(query ? { query } : {}),
  });
  const reviewCount = await countInReview();

  const filters = [
    { key: "", label: "All" },
    { key: "mine", label: "Mine" },
    { key: "review", label: `In review${reviewCount ? ` (${reviewCount})` : ""}` },
    { key: "published", label: "Published" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Help Center</h1>
          <p className="text-muted-foreground text-sm">
            Write and review the articles published on the public help site
          </p>
        </div>
        <div className="flex items-center gap-2">
          {admin && (
            <Button variant="outline" asChild>
              <Link href="/help-center/settings">
                <SettingsIcon /> Categories &amp; settings
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/help-center/new">
              <PlusIcon /> New article
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search articles, including their text…" />
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={activeFilter === f.key ? "secondary" : "ghost"}
              asChild
            >
              <Link href={f.key ? `/help-center?filter=${f.key}` : "/help-center"}>{f.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      {articles.length === 0 ? (
        <EmptyState
          icon={BookOpenIcon}
          title={query ? "No articles matched" : "No articles here"}
          description={
            query
              ? `Nothing matches “${query}” — try a different word, or clear the search.`
              : "Write your first help article — it goes live after admin review."
          }
        />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/help-center/${a.id}`} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                      <div className="text-muted-foreground max-w-[420px] truncate text-xs">
                        /{a.category.slug}/{a.slug}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{a.category.title}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_VARIANTS[a.status] ?? ""} variant="outline">
                        {STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a.author?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(a.updatedAt)}
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
