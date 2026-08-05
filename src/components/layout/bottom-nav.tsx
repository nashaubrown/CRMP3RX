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

// Same motion language as the cards: a small rise on hover, 180ms, and no
// movement at all for anyone who asks for reduced motion.
const tabBase =
  "relative flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-medium " +
  "transition-[color,background-color,transform] duration-200 ease-out " +
  "hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

// Selected keeps a tinted pill so the current page still reads as "on" when
// the cursor is elsewhere in the bar; hover is the lighter preview of it.
const tabSelected = "bg-sidebar-accent text-sidebar-accent-foreground";
const tabIdle = "text-muted-foreground hover:bg-muted hover:text-foreground";

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
      {/* max-w-3xl (768px) used to cap this while 15 destinations need ~1300px,
          so the row overflowed to the right of a centred box and read as
          off-centre. Match the app shell's width, centre the items, and let
          narrow desktops scroll rather than overflow. */}
      <ul className="mx-auto hidden w-full max-w-[1600px] justify-center overflow-x-auto px-2 sm:flex">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  tabBase,
                  // nowrap keeps "Help Center"/"Ask Perx" on one line, so the
                  // bar stays a consistent height instead of going ragged.
                  "min-w-16 px-3 whitespace-nowrap",
                  active ? tabSelected : tabIdle
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
                active ? tabSelected : tabIdle
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
              overflowActive ? tabSelected : tabIdle
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
