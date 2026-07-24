"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Fires a one-off success toast when a query param is present (e.g. after
// creating a record and redirecting back to the list), then strips the param
// so it doesn't re-fire on refresh. Renders nothing.
export function FlashToast({ param = "created", message }: { param?: string; message: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(param);

  React.useEffect(() => {
    if (!value) return;
    toast.success(message);
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete(param);
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    // Only re-run when the flag appears; other deps are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return null;
}
