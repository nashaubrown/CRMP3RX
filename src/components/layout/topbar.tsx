"use client";

import * as React from "react";
import Link from "next/link";
import { LogOutIcon, MenuIcon } from "lucide-react";

import { AssistantSheet } from "@/components/assistant/assistant-sheet";
import { SidebarNav } from "@/components/layout/sidebar-nav";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type TopbarProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: string;
  };
  onSignOut: () => Promise<void>;
};

export function Topbar({ user, onSignOut }: TopbarProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="bg-background sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <MenuIcon className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>
              <Link href="/dashboard" onClick={() => setMobileNavOpen(false)}>
                Perx CRM
              </Link>
            </SheetTitle>
          </SheetHeader>
          <div className="py-2">
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <AssistantSheet />
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
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
    </header>
  );
}
