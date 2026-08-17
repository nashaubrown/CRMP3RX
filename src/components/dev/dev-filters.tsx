"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { PRODUCT_LABELS, TYPE_LABELS } from "@/components/dev/ticket-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

// URL-driven filters, so a filtered board is shareable and survives refresh.
export function DevFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === ALL || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q });
        }}
      >
        <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tickets…"
          className="h-9 w-56 pl-8"
        />
      </form>
      <Select value={params.get("product") ?? ALL} onValueChange={(v) => apply({ product: v })}>
        <SelectTrigger size="sm" className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All products</SelectItem>
          {Object.entries(PRODUCT_LABELS).map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("type") ?? ALL} onValueChange={(v) => apply({ type: v })}>
        <SelectTrigger size="sm" className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {Object.entries(TYPE_LABELS).map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={params.get("mine") === "1" ? "secondary" : "outline"}
        size="sm"
        onClick={() => apply({ mine: params.get("mine") === "1" ? null : "1" })}
      >
        My tickets
      </Button>
    </div>
  );
}
