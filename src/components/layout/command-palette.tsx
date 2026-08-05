"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { SearchIcon } from "lucide-react";

import { quickSearchAction } from "@/app/(app)/search-actions";
import { navItemsFor, type NavItem } from "@/components/layout/nav-items";
import type { QuickHit, QuickHitType } from "@/services/search";
import { cn } from "@/lib/utils";

// ⌘K / Ctrl+K palette: jump to any merchant, contact, deal or lead by name, or
// to any page. Typing hits the server (debounced); pages are filtered locally
// so navigation stays instant and works before you've typed anything.

const TYPE_LABEL: Record<QuickHitType, string> = {
  MERCHANT: "Merchant",
  CONTACT: "Contact",
  DEAL: "Deal",
  LEAD: "Lead",
};

const DEBOUNCE_MS = 180;

export function CommandPalette({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<QuickHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  // The last term actually sent to the server, so the empty state can tell
  // "still typing" apart from "searched and found nothing".
  const [searched, setSearched] = React.useState("");

  const pages: NavItem[] = React.useMemo(() => navItemsFor(isAdmin), [isAdmin]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced record search. Every state update happens inside the timer, so
  // nothing is set synchronously during the effect. `cancelled` stops an
  // earlier, slower response from overwriting a later one.
  React.useEffect(() => {
    const term = query.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (term.length < 2) {
        if (!cancelled) {
          setHits([]);
          setSearched(term);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const results = await quickSearchAction(term);
        if (!cancelled) setHits(results);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) {
          setSearched(term);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      {/* The trigger in the header. Matches the Help Center's search pill. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground bg-background hover:border-ring/60 hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors md:flex"
      >
        <SearchIcon className="size-3.5" />
        <span>Search</span>
        <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search Perx CRM"
        shouldFilter={false}
        className="bg-card fixed top-[15vh] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b px-4">
          <SearchIcon className="text-muted-foreground size-4 shrink-0" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search merchants, contacts, deals, leads…"
            className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
          />
        </div>

        <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          <Command.Empty className="text-muted-foreground py-8 text-center text-sm">
            {query.trim().length < 2
              ? "Type at least two characters."
              : loading || searched !== query.trim()
                ? "Searching…"
                : "Nothing matched."}
          </Command.Empty>

          {hits.length > 0 ? (
            <Command.Group
              heading="Records"
              className="text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
            >
              {hits.map((hit) => (
                <Command.Item
                  key={`${hit.type}-${hit.id}`}
                  value={`${hit.type}-${hit.id}`}
                  onSelect={() => go(hit.href)}
                  className="data-[selected=true]:bg-accent text-foreground flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{hit.title}</span>
                    {hit.subtitle ? (
                      <span className="text-muted-foreground ml-2 text-xs">{hit.subtitle}</span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {TYPE_LABEL[hit.type]}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {/* Pages are matched client-side so this works with an empty query. */}
          <PageGroup pages={pages} query={query} onGo={go} />
        </Command.List>
      </Command.Dialog>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}
    </>
  );
}

function PageGroup({
  pages,
  query,
  onGo,
}: {
  pages: NavItem[];
  query: string;
  onGo: (href: string) => void;
}) {
  const term = query.trim().toLowerCase();
  const matches = term ? pages.filter((p) => p.title.toLowerCase().includes(term)) : pages;
  if (matches.length === 0) return null;

  return (
    <Command.Group
      heading="Go to"
      className="text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
    >
      {matches.map((page) => (
        <Command.Item
          key={page.href}
          value={`page-${page.href}`}
          onSelect={() => onGo(page.href)}
          className={cn(
            "data-[selected=true]:bg-accent text-foreground",
            "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm"
          )}
        >
          <page.icon className="text-muted-foreground size-4 shrink-0" />
          {page.title}
        </Command.Item>
      ))}
    </Command.Group>
  );
}
