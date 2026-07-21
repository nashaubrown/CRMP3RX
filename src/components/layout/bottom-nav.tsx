"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontalIcon } from "lucide-react";

import { navItemsFor, type NavItem } from "@/components/layout/nav-items";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// The 4 tabs kept visible on phones; everything else lives under "More".
const MOBILE_PRIMARY = ["/dashboard", "/merchants", "/deals", "/tasks"];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

const tabBase =
  "relative flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors";

function ActiveBar() {
  return <span className="bg-primary absolute inset-x-3 top-0 h-0.5 rounded-full" aria-hidden />;
}

// Primary navigation as a bottom bar. On wide screens every destination shows;
// on phones only 4 primary tabs plus a "More" sheet for the rest.
export function BottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const isActive = useIsActive();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const navItems = navItemsFor(isAdmin);
  const primary = MOBILE_PRIMARY.map((h) => navItems.find((i) => i.href === h)).filter(
    Boolean
  ) as NavItem[];
  const overflow = navItems.filter((i) => !MOBILE_PRIMARY.includes(i.href));
  const overflowActive = overflow.some((i) => isActive(i.href));

  return (
    <nav
      aria-label="Primary"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      {/* Tablet / desktop: every destination */}
      <ul className="mx-auto hidden max-w-3xl justify-around sm:flex">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  tabBase,
                  "min-w-16 px-3",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active ? <ActiveBar /> : null}
                <item.icon className="size-5 shrink-0" />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Phones: 4 primary tabs + More */}
      <div className="flex sm:hidden">
        {primary.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                tabBase,
                "min-h-14 flex-1",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active ? <ActiveBar /> : null}
              <item.icon className="size-5 shrink-0" />
              {item.title}
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={cn(
              tabBase,
              "min-h-14 flex-1",
              overflowActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            {overflowActive ? <ActiveBar /> : null}
            <MoreHorizontalIcon className="size-5 shrink-0" />
            More
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl p-0">
            <SheetHeader className="border-b px-4">
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-1 gap-1 p-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              {overflow.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="text-muted-foreground size-5 shrink-0" />
                    {item.title}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
