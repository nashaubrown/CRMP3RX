import { cn } from "@/lib/utils";

// One page-title treatment for the whole app: a 20px title and, under it, a
// line of facts about the page separated by middots — "141 merchants · 96
// active · 12 onboarding" — rather than a sentence describing it. Actions sit
// on the right of the same row.
export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Short facts. Strings are joined with middots; falsy entries drop out. */
  meta?: React.ReactNode | (React.ReactNode | null | false | undefined)[];
  actions?: React.ReactNode;
  className?: string;
}) {
  const parts = Array.isArray(meta) ? meta.filter(Boolean) : meta ? [meta] : [];

  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {parts.length > 0 ? (
          <p className="page-meta mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {parts.map((part, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 ? (
                  <span className="text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                ) : null}
                {part}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
