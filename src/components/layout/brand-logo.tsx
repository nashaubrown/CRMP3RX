"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// The Perx wordmark, matching the Help Center (help.perx.mv) so the two
// properties share one identity. The asset is solid black, so it's inverted in
// dark mode — same trick the Help Center uses.
//
// Falls back to a lettermark tile if the file is ever missing, so a bad deploy
// never leaves a broken image in the header.
export function BrandLogo({
  imgClassName,
  fallbackClassName,
  fallbackText = "P",
}: {
  imgClassName: string;
  fallbackClassName: string;
  fallbackText?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          "bg-primary text-primary-foreground flex items-center justify-center rounded-md font-bold",
          fallbackClassName
        )}
        aria-hidden
      >
        {fallbackText}
      </span>
    );
  }

  return (
    // Plain <img>: we want the native onError fallback above, and the wordmark
    // is a fixed-aspect SVG sized by height.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/perx.svg"
      alt="Perx"
      onError={() => setFailed(true)}
      className={cn("object-contain dark:invert", imgClassName)}
    />
  );
}

// The green pill that sits beside the wordmark ("CRM", "Help Center"), lifted
// from the Help Center header.
export function BrandBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {children}
    </span>
  );
}
