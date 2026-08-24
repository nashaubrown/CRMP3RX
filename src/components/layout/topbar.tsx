"use client";

import Link from "next/link";
import { LogOutIcon } from "lucide-react";

import { AssistantSheet } from "@/components/assistant/assistant-sheet";
import { BrandBadge, BrandLogo } from "@/components/layout/brand-logo";
import { CommandPalette } from "@/components/layout/command-palette";
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

// Floating pill header. Navigation itself lives in the left sidebar on desktop
// and the bottom tab bar on phones, so this bar carries only the things that
// belong to no page in particular: ⌘K search, the display toggles, and — below
// lg, where the sidebar is hidden — the brand and the account menu.

export function Topbar({ user, generativeUi, onSignOut }: TopbarProps) {
  const isAdmin = user.role === "ADMIN";

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <div className="bg-card/95 supports-[backdrop-filter]:bg-card/80 surface-card mx-auto flex w-full max-w-[1600px] items-center gap-2 rounded-full border px-3 py-2 backdrop-blur">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2.5 lg:hidden"
          aria-label="Perx CRM home"
        >
          <BrandLogo imgClassName="h-5 w-auto" fallbackClassName="size-7 rounded-md text-sm" />
          <BrandBadge>CRM</BrandBadge>
        </Link>

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
