"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Two month inputs bound to `from`/`to` URL params. Commission is recurring
// monthly, so the range picks how many months to total.
export function RangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function set(param: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(param, value);
    else params.delete(param);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from" className="text-xs">
          From
        </Label>
        <Input
          id="from"
          type="month"
          value={from}
          max={to}
          onChange={(e) => set("from", e.target.value)}
          className="h-9 w-40"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to" className="text-xs">
          To
        </Label>
        <Input
          id="to"
          type="month"
          value={to}
          min={from}
          onChange={(e) => set("to", e.target.value)}
          className="h-9 w-40"
        />
      </div>
    </div>
  );
}
