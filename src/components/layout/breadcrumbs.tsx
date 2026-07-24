import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

export type Crumb = { label: string; href?: string };

// A simple breadcrumb trail. The last item is the current page (no link);
// earlier items link back up (e.g. Merchants / CRNCH).
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <ChevronRightIcon className="size-3.5 shrink-0 opacity-60" /> : null}
          {c.href ? (
            <Link href={c.href} className="hover:text-foreground hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className="text-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
