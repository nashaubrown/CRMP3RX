"use client";

import Link from "next/link";
import { LogOutIcon } from "lucide-react";

import { AssistantSheet } from "@/components/assistant/assistant-sheet";
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

export function Topbar({ user, generativeUi, onSignOut }: TopbarProps) {
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
        <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold">
          P
        </span>
        <span className="hidden sm:inline">Perx CRM</span>
      </Link>

      <div className="flex-1" />

      <UiModeToggle generative={generativeUi} />
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
      </div>
    </header>
  );
}
