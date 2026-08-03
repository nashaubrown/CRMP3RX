"use client";

import * as React from "react";
import { APIProvider, AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps";

import { MerchantInfoWindow } from "@/components/maps/merchant-info-window";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  MAPS_ENABLED,
  type MerchantPin,
  pinColors,
} from "@/lib/maps";

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// All-merchants map. Green = onboarded (loyalty live), amber = active, grey =
// other. Click a pin for details.
export function MerchantsMap({ pins }: { pins: MerchantPin[] }) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  if (!MAPS_ENABLED) {
    return (
      <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-1 rounded-lg border text-center text-sm">
        <p className="font-medium">Map needs a Google Maps API key</p>
        <p className="text-xs">
          Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable the map view.
        </p>
      </div>
    );
  }

  const active = pins.find((p) => p.id === activeId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      {pins.length === 0 ? (
        <div className="bg-muted/60 text-muted-foreground rounded-lg border px-3 py-2 text-sm">
          <span className="text-foreground font-medium">No merchants have a location yet.</span>{" "}
          Open a merchant → Edit → Location to place it here. (The labels on the map below are
          Google&apos;s own places, not your merchants.)
        </div>
      ) : null}
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <div className="relative h-[68vh] w-full overflow-hidden rounded-lg border">
          <Map
            mapId={GOOGLE_MAPS_MAP_ID}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            gestureHandling="greedy"
            clickableIcons={false}
          >
            {pins.map((p) => {
              const c = pinColors(p);
              return (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  title={p.name}
                  onClick={() => setActiveId(p.id)}
                >
                  <Pin background={c.background} glyphColor={c.glyph} borderColor={c.border} />
                </AdvancedMarker>
              );
            })}

            {active ? (
              <MerchantInfoWindow pin={active} onClose={() => setActiveId(null)} />
            ) : null}
          </Map>
        </div>
      </APIProvider>

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <LegendDot color="#16a34a" label="Onboarded (loyalty live)" />
        <LegendDot color="#f59e0b" label="Active" />
        <LegendDot color="#94a3b8" label="Prospect / other" />
        <span className="ml-auto">
          {pins.length} merchant{pins.length === 1 ? "" : "s"} mapped
        </span>
      </div>
    </div>
  );
}
