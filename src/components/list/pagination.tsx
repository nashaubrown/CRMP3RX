import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Server-rendered pagination links that preserve current filters.
export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  function pageHref(target: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && key !== "page") params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-muted-foreground text-sm">
        {total} {total === 1 ? "result" : "results"} · page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild disabled={page <= 1}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)}>
              <ChevronLeftIcon /> Previous
            </Link>
          ) : (
            <span aria-disabled>
              <ChevronLeftIcon /> Previous
            </span>
          )}
        </Button>
        <Button variant="outline" size="sm" asChild disabled={page >= pageCount}>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)}>
              Next <ChevronRightIcon />
            </Link>
          ) : (
            <span aria-disabled>
              Next <ChevronRightIcon />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
