"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon } from "lucide-react";

import { AssistantSheet } from "@/components/assistant/assistant-sheet";
import { BrandBadge, BrandLogo } from "@/components/layout/brand-logo";
import { CommandPalette } from "@/components/layout/command-palette";
import { navItemsFor } from "@/components/layout/nav-items";
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

// A flat bar with a hairline under it, not a floating pill: the page below is
// the object, and the chrome should not compete with it. Navigation lives in
// the left sidebar on desktop and the bottom tab bar on phones, so this carries
// only what belongs to no page in particular — where you are, ⌘K search, the
// display toggles, and (below lg, where the sidebar is hidden) brand and
// account.

export function Topbar({ user, generativeUi, onSignOut }: TopbarProps) {
  const isAdmin = user.role === "ADMIN";
  const pathname = usePathname();
  const section = navItemsFor(isAdmin).find(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`)
  );

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-13 w-full max-w-[1600px] items-center gap-2 px-4 md:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2.5 lg:hidden"
          aria-label="Perx CRM home"
        >
          <BrandLogo imgClassName="h-5 w-auto" fallbackClassName="size-7 rounded-md text-sm" />
          <BrandBadge>CRM</BrandBadge>
        </Link>

        {/* Where you are, in the reference's workspace / page form. Detail
            pages still render their own deeper trail below this. */}
        <nav aria-label="Location" className="hidden min-w-0 items-center gap-1.5 text-[13px] lg:flex">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Perx CRM
          </Link>
          {section ? (
            <>
              <span className="text-muted-foreground/50" aria-hidden>
                /
              </span>
              <span className="truncate font-medium">{section.title}</span>
            </>
          ) : null}
        </nav>

        <div className="flex-1" />

        <CommandPalette isAdmin={isAdmin} />
        <UiModeToggle generative={generativeUi} />
        <AssistantSheet />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 rounded-full px-1.5 lg:hidden">
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
