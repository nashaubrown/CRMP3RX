"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// Renders the Perx logo from /public/perx-logo.png. Until that file is added to
// the repo it gracefully falls back to the lettermark tile, so shipping this
// component never leaves a broken image in the UI.
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
    // Plain <img>: the aspect ratio is unknown (square icon vs. wide wordmark),
    // and we want the native onError fallback above.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/perx-logo.png"
      alt="Perx"
      onError={() => setFailed(true)}
      className={cn("object-contain", imgClassName)}
    />
  );
}
