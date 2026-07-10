import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Clickable column header that toggles ?sort=&dir= while preserving filters.
export function SortableHead({
  label,
  sortKey,
  basePath,
  searchParams,
  className,
}: {
  label: string;
  sortKey: string;
  basePath: string;
  searchParams: Record<string, string | undefined>;
  className?: string;
}) {
  const currentSort = searchParams.sort;
  const currentDir = searchParams.dir === "asc" ? "asc" : "desc";
  const active = currentSort === sortKey;
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && key !== "page") params.set(key, value);
  }
  params.set("sort", sortKey);
  params.set("dir", nextDir);

  return (
    <TableHead className={className}>
      <Link
        href={`${basePath}?${params.toString()}`}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1",
          active && "text-foreground"
        )}
      >
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          )
        ) : (
          <ArrowUpDownIcon className="size-3.5 opacity-40" />
        )}
      </Link>
    </TableHead>
  );
}
