"use client";

import * as React from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { CrosshairIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDistanceM } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { Fix, MyLocationStatus } from "@/components/maps/use-my-location";

// Deliberately blue, not Perx green: green, amber and grey are already spoken
// for by merchant pins, and "you are here" is the one thing on these maps that
// isn't a record. Blue is also what every other map means by it.
const ME = "#1a73e8";

// Above this the fix is a wifi guess, not GPS, and pinning a shopfront with it
// would put the pin on the wrong street.
export const VAGUE_ACCURACY_M = 75;

// Draws the fix inside a <Map>: a dot for the position and a circle for how
// much the device is guessing. Pans to each new fix.
export function MyLocationLayer({ fix, zoom = 17 }: { fix: Fix | null; zoom?: number }) {
  const map = useMap();

  React.useEffect(() => {
    if (!map || !fix) return;
    const ring = new google.maps.Circle({
      center: { lat: fix.lat, lng: fix.lng },
      radius: fix.accuracyM,
      strokeColor: ME,
      strokeOpacity: 0.5,
      strokeWeight: 1,
      fillColor: ME,
      fillOpacity: 0.12,
      clickable: false,
      map,
    });
    return () => ring.setMap(null);
  }, [map, fix]);

  React.useEffect(() => {
    if (!map || !fix) return;
    map.panTo({ lat: fix.lat, lng: fix.lng });
    // Don't zoom past what the fix can actually support — a 300m-accurate
    // position framed at street level reads as far more precise than it is.
    const cap = fix.accuracyM > VAGUE_ACCURACY_M ? 15 : zoom;
    if ((map.getZoom() ?? 0) < cap) map.setZoom(cap);
  }, [map, fix, zoom]);

  if (!fix) return null;

  return (
    <AdvancedMarker position={{ lat: fix.lat, lng: fix.lng }} title="You are here" zIndex={20}>
      <span
        className="block size-3.5 rounded-full border-2 border-white shadow-md"
        style={{ background: ME }}
      />
    </AdvancedMarker>
  );
}

// The control itself. Sized for a thumb, because the people who need it are
// standing in the street rather than sitting at a desk.
export function MyLocationButton({
  status,
  onLocate,
  className,
}: {
  status: MyLocationStatus;
  onLocate: () => void;
  className?: string;
}) {
  const busy = status === "locating";
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onLocate}
      disabled={busy || status === "unsupported"}
      aria-label="Show my location"
      className={cn("h-9 gap-1.5 shadow-md", className)}
    >
      {busy ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <CrosshairIcon className="size-4" />
      )}
      {busy ? "Locating…" : "My location"}
    </Button>
  );
}

// One line under a map explaining the state of the fix. Always states the
// accuracy: a dot with no margin of error reads as certainty the GPS can't back.
export function MyLocationStatusLine({
  status,
  fix,
  error,
  children,
}: {
  status: MyLocationStatus;
  fix: Fix | null;
  error: string | null;
  /** Extra detail to show alongside a good fix — e.g. the zone you're in. */
  children?: React.ReactNode;
}) {
  if (error) {
    return <p className="text-destructive text-xs">{error}</p>;
  }
  if (!fix) return null;

  const vague = fix.accuracyM > VAGUE_ACCURACY_M;
  return (
    <p className={cn("text-xs", vague ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
      <span className="font-medium" style={{ color: ME }}>
        You
      </span>{" "}
      at {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} — accurate to about{" "}
      {formatDistanceM(fix.accuracyM)}
      {vague ? " (too rough to pin a shopfront — try again outdoors)" : ""}
      {status === "locating" ? " · refreshing…" : ""}
      {children ? <> · {children}</> : null}
    </p>
  );
}
