"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon, LogOutIcon, PanelLeftIcon } from "lucide-react";

import { BrandBadge, BrandLogo } from "@/components/layout/brand-logo";
import { navSectionsFor, type NavItem, type NavSection } from "@/components/layout/nav-items";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SidebarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
};

// Every destination lives here, grouped, so nothing hides behind a "More"
// menu. Eighteen links overflow a laptop viewport, so sections collapse and
// the choice is remembered; the account row is pinned to the bottom and never
// scrolls away.
const COLLAPSED_KEY = "perx.nav.collapsed";
const RAIL_KEY = "perx.nav.rail";

// Preferences live in localStorage so they survive a reload without a round
// trip, and are read through useSyncExternalStore so the server render (which
// has no storage) and the first client render agree, then correct themselves.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readPref(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    // Private mode or blocked storage: behave as if nothing was ever saved.
    return "";
  }
}

function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The preference just won't persist; the session still honours it.
  }
  for (const listener of listeners) listener();
}

function usePref(key: string): string {
  return React.useSyncExternalStore(
    subscribe,
    () => readPref(key),
    () => ""
  );
}

function roleLabel(role: string) {
  if (role === "ADMIN") return "Admin";
  if (role === "DEVELOPER") return "Developer";
  return "Sales rep";
}

export function AppSidebar({
  user,
  onSignOut,
}: {
  user: SidebarUser;
  onSignOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const isAdmin = user.role === "ADMIN";
  const sections = React.useMemo(() => navSectionsFor(isAdmin), [isAdmin]);

  const collapsedRaw = usePref(COLLAPSED_KEY);
  const rail = usePref(RAIL_KEY) === "1";

  const collapsed = React.useMemo(() => {
    try {
      return new Set<string>(collapsedRaw ? (JSON.parse(collapsedRaw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }, [collapsedRaw]);

  function toggleSection(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writePref(COLLAPSED_KEY, JSON.stringify([...next]));
  }

  function toggleRail() {
    writePref(RAIL_KEY, rail ? "0" : "1");
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      data-rail={rail ? "" : undefined}
      className={cn(
        "bg-sidebar text-sidebar-foreground glass-panel sticky top-0 hidden h-svh shrink-0 flex-col border-r lg:flex",
        rail ? "w-[68px]" : "w-60"
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", rail && "justify-center px-0")}>
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2"
          aria-label="Perx CRM home"
        >
          {/* The wordmark is far wider than the 68px rail, so the rail wears
              the lettermark instead of clipping the logo. */}
          {rail ? (
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
              P
            </span>
          ) : (
            <>
              <BrandLogo imgClassName="h-5 w-auto" fallbackClassName="size-7 rounded-md text-sm" />
              <BrandBadge>CRM</BrandBadge>
            </>
          )}
        </Link>
        {rail ? null : (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleRail}
            className="text-muted-foreground ml-auto size-7"
            aria-label="Collapse sidebar"
          >
            <PanelLeftIcon className="size-4" />
          </Button>
        )}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 pb-3">
        {sections.map((section) => (
          <Section
            key={section.id}
            section={section}
            rail={rail}
            collapsed={collapsed.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            isActive={isActive}
          />
        ))}
      </nav>

      <div className="border-t p-2">
        {rail ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleRail}
            className="text-muted-foreground mx-auto mb-1 flex size-9"
            aria-label="Expand sidebar"
          >
            <PanelLeftIcon className="size-4 rotate-180" />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "h-auto w-full justify-start gap-2 px-2 py-2",
                rail && "justify-center px-0"
              )}
            >
              <Avatar className="size-7">
                {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              {rail ? null : (
                <span className="flex min-w-0 flex-col items-start">
                  <span className="w-full truncate text-sm font-medium">{user.name}</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    {roleLabel(user.role)}
                  </span>
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span>{user.name}</span>
                <span className="text-muted-foreground text-xs font-normal">{user.email}</span>
                <span className="text-muted-foreground text-xs font-normal">
                  {roleLabel(user.role)}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onSignOut()}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

function Section({
  section,
  rail,
  collapsed,
  onToggle,
  isActive,
}: {
  section: NavSection;
  rail: boolean;
  collapsed: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
}) {
  // A collapsed section that holds the current page would hide where you are,
  // so it stays open regardless of the stored preference.
  const holdsCurrent = section.items.some((i) => isActive(i.href));
  const open = rail || !collapsed || holdsCurrent;

  return (
    <div className="pt-3 first:pt-1">
      {rail ? (
        <div className="bg-sidebar-border mx-auto my-2 h-px w-6" aria-hidden />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-[11px] font-semibold tracking-wider uppercase"
        >
          <ChevronRightIcon
            className={cn("size-3 transition-transform", open && "rotate-90")}
            aria-hidden
          />
          {section.label}
        </button>
      )}
      {open ? (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} rail={rail} active={isActive(item.href)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavLink({ item, rail, active }: { item: NavItem; rail: boolean; active: boolean }) {
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        rail && "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {rail ? <span className="sr-only">{item.title}</span> : item.title}
    </Link>
  );

  if (!rail) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  );
}
