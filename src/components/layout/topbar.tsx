"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, LogOutIcon } from "lucide-react";

import { AssistantSheet } from "@/components/assistant/assistant-sheet";
import { BrandBadge, BrandLogo } from "@/components/layout/brand-logo";
import { CommandPalette } from "@/components/layout/command-palette";
import { splitNav } from "@/components/layout/nav-items";
import { UiModeToggle } from "@/components/generative/ui-mode-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { cn } from "@/lib/utils";

type TopbarProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: string;
  };
  generativeUi: boolean;
  onSignOut: () => Promise<void>;
};

// Floating pill header, matching help.perx.mv. On desktop it carries the six
// destinations a rep opens daily, a "More" menu for the rest, and ⌘K search.
// On phones it's brand + account only — navigation stays in the bottom tab bar,
// which is reachable with a thumb.

const linkBase =
  "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors";

export function Topbar({ user, generativeUi, onSignOut }: TopbarProps) {
  const pathname = usePathname();
  const isAdmin = user.role === "ADMIN";
  const { primary, overflow } = React.useMemo(() => splitNav(isAdmin), [isAdmin]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const overflowActive = overflow.some((i) => isActive(i.href));

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <div className="bg-card/95 supports-[backdrop-filter]:bg-card/80 surface-card mx-auto flex w-full max-w-[1600px] items-center gap-2 rounded-full border px-3 py-2 backdrop-blur">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5" aria-label="Perx CRM home">
          <BrandLogo imgClassName="h-5 w-auto" fallbackClassName="size-7 rounded-md text-sm" />
          <BrandBadge>CRM</BrandBadge>
        </Link>

        {/* Desktop destinations */}
        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 lg:flex">
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                linkBase,
                isActive(item.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.title}
            </Link>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                linkBase,
                "flex items-center gap-1",
                overflowActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              More
              <ChevronDownIcon className="size-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {overflow.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="cursor-pointer">
                    <item.icon className="text-muted-foreground size-4" />
                    {item.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="flex-1" />

        <CommandPalette isAdmin={isAdmin} />
        <UiModeToggle generative={generativeUi} />
        <AssistantSheet />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 rounded-full px-1.5">
              <Avatar className="size-7">
                {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span>{user.name}</span>
                <span className="text-muted-foreground text-xs font-normal">{user.email}</span>
                <span className="text-muted-foreground text-xs font-normal">
                  {user.role === "ADMIN" ? "Admin" : "Sales Rep"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void onSignOut()}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
