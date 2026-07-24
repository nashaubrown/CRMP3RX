"use client";

import { APIProvider, AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps";

import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  MAPS_ENABLED,
  pinColors,
} from "@/lib/maps";

// Single-marker map for a merchant's detail page.
export function MerchantMiniMap({
  lat,
  lng,
  name,
  onboarded,
  status,
}: {
  lat: number;
  lng: number;
  name: string;
  onboarded: boolean;
  status: string;
}) {
  if (!MAPS_ENABLED) return null;
  const c = pinColors({ onboarded, status });

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="h-56 w-full overflow-hidden rounded-lg border">
        <Map
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={{ lat, lng }}
          defaultZoom={16}
          gestureHandling="cooperative"
          disableDefaultUI
          clickableIcons={false}
        >
          <AdvancedMarker position={{ lat, lng }} title={name}>
            <Pin background={c.background} glyphColor={c.glyph} borderColor={c.border} />
          </AdvancedMarker>
        </Map>
      </div>
    </APIProvider>
  );
}
