"use client";

import * as React from "react";
import { SparklesIcon } from "lucide-react";

import { ChatPanel } from "@/components/assistant/chat-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Slide-over assistant, available on every page via the topbar.
export function AssistantSheet() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ask Perx">
          <SparklesIcon className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" /> Ask Perx
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <ChatPanel />
        </div>
      </SheetContent>
    </Sheet>
  );
}
