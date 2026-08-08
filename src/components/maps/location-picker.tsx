"use client";

import * as React from "react";
import { APIProvider, AdvancedMarker, Map, useMapsLibrary } from "@vis.gl/react-google-maps";

import { MyLocationButton, MyLocationLayer, VAGUE_ACCURACY_M } from "@/components/maps/my-location";
import { useMyLocation } from "@/components/maps/use-my-location";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDistanceM } from "@/lib/geo";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  MAPS_ENABLED,
} from "@/lib/maps";

type LatLng = { lat: number; lng: number };

// Google Places address search wired to a plain text input. On selection it
// reports the chosen location to the parent.
function AddressSearch({ onPick }: { onPick: (p: LatLng) => void }) {
  const places = useMapsLibrary("places");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onPickRef = React.useRef(onPick);

  React.useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  React.useEffect(() => {
    if (!places || !inputRef.current) return;
    const ac = new places.Autocomplete(inputRef.current, { fields: ["geometry"] });
    const listener = ac.addListener("place_changed", () => {
      const loc = ac.getPlace().geometry?.location;
      if (loc) onPickRef.current({ lat: loc.lat(), lng: loc.lng() });
    });
    return () => listener.remove();
  }, [places]);

  return <Input ref={inputRef} placeholder="Search an address or place…" />;
}

// Manual entry fallback when no Maps key is configured.
function ManualLatLng({
  defaultLat,
  defaultLng,
}: {
  defaultLat?: number | null;
  defaultLng?: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="latitude">Latitude</Label>
        <Input
          id="latitude"
          name="latitude"
          type="number"
          step="any"
          placeholder="4.1755"
          defaultValue={defaultLat ?? ""}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="longitude">Longitude</Label>
        <Input
          id="longitude"
          name="longitude"
          type="number"
          step="any"
          placeholder="73.5093"
          defaultValue={defaultLng ?? ""}
        />
      </div>
      <p className="text-muted-foreground col-span-2 text-xs">
        Add a Google Maps API key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) to pick locations on a map.
      </p>
    </div>
  );
}

export function LocationPicker({
  defaultLat,
  defaultLng,
}: {
  defaultLat?: number | null;
  defaultLng?: number | null;
}) {
  const [pos, setPos] = React.useState<LatLng | null>(
    defaultLat != null && defaultLng != null ? { lat: defaultLat, lng: defaultLng } : null
  );
  const me = useMyLocation();

  // A fix is only ever a suggestion here — it drops the pin, and the rep can
  // still drag it onto the doorway. So we adopt each new fix as it lands.
  const adoptedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!me.fix) return;
    const key = `${me.fix.lat},${me.fix.lng}`;
    if (adoptedRef.current === key) return;
    adoptedRef.current = key;
    setPos({ lat: me.fix.lat, lng: me.fix.lng });
  }, [me.fix]);

  if (!MAPS_ENABLED) {
    return <ManualLatLng defaultLat={defaultLat} defaultLng={defaultLng} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Submitted with the form; empty string clears the location. */}
      <input type="hidden" name="latitude" value={pos?.lat ?? ""} />
      <input type="hidden" name="longitude" value={pos?.lng ?? ""} />

      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        {/* Stacked on a phone: side by side, the address field is squeezed to
            about twenty characters — and a phone is where both get used. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="sm:flex-1">
            <AddressSearch onPick={setPos} />
          </div>
          <MyLocationButton
            status={me.status}
            onLocate={me.locate}
            className="w-full shrink-0 sm:w-auto"
          />
        </div>
        <div className="h-64 w-full overflow-hidden rounded-lg border">
          <Map
            mapId={GOOGLE_MAPS_MAP_ID}
            defaultCenter={pos ?? DEFAULT_CENTER}
            defaultZoom={pos ? 16 : DEFAULT_ZOOM}
            gestureHandling="greedy"
            clickableIcons={false}
            onClick={(e) => {
              if (e.detail.latLng) setPos({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng });
            }}
          >
            {pos ? (
              <AdvancedMarker
                position={pos}
                draggable
                onDragEnd={(e) => {
                  if (e.latLng) setPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                }}
              />
            ) : null}
            <MyLocationLayer fix={me.fix} />
          </Map>
        </div>
        {me.error ? <p className="text-destructive text-xs">{me.error}</p> : null}
        {me.fix && me.fix.accuracyM > VAGUE_ACCURACY_M ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Your position is only accurate to about {formatDistanceM(me.fix.accuracyM)} — that can be
            the wrong side of the street. Drag the pin onto the door before saving.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {pos
              ? `Pin at ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} — drag it or click the map to adjust.`
              : "Search an address, use your location, or click the map to drop a pin."}
          </p>
          {pos ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setPos(null)}>
              Clear
            </Button>
          ) : null}
        </div>
      </APIProvider>
    </div>
  );
}
