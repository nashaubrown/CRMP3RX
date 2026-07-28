"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { APIProvider, AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps";
import { MapPinIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteOutletAction, saveOutletAction } from "@/app/(app)/merchants/outlet-actions";
import { LocationPicker } from "@/components/maps/location-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  MAPS_ENABLED,
} from "@/lib/maps";

export type OutletRow = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isPrimary: boolean;
};

function OutletsMap({ outlets, color }: { outlets: OutletRow[]; color: { background: string; glyph: string; border: string } }) {
  const located = outlets.filter((o) => o.latitude != null && o.longitude != null);
  if (!MAPS_ENABLED || located.length === 0) return null;
  const center = { lat: located[0].latitude!, lng: located[0].longitude! };
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="h-56 w-full overflow-hidden rounded-lg border">
        <Map
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={located.length === 1 ? center : DEFAULT_CENTER}
          defaultZoom={located.length === 1 ? 15 : DEFAULT_ZOOM}
          gestureHandling="cooperative"
          disableDefaultUI
          clickableIcons={false}
        >
          {located.map((o) => (
            <AdvancedMarker key={o.id} position={{ lat: o.latitude!, lng: o.longitude! }} title={o.name}>
              <Pin
                background={color.background}
                glyphColor={color.glyph}
                borderColor={color.border}
                scale={o.isPrimary ? 1 : 0.8}
              />
            </AdvancedMarker>
          ))}
        </Map>
      </div>
    </APIProvider>
  );
}

function OutletForm({
  merchantId,
  outlet,
  onDone,
  onCancel,
}: {
  merchantId: string;
  outlet: OutletRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await saveOutletAction(merchantId, outlet?.id ?? null, {
        name: formData.get("name"),
        address: formData.get("address"),
        latitude: formData.get("latitude"),
        longitude: formData.get("longitude"),
        isPrimary: formData.get("isPrimary"),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(outlet ? "Outlet updated" : "Outlet added");
      onDone();
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{outlet ? "Edit outlet" : "Add outlet"}</p>
        <Button type="button" variant="ghost" size="icon" className="size-6" onClick={onCancel}>
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="o-name">Outlet name</Label>
        <Input
          id="o-name"
          name="name"
          defaultValue={outlet?.name ?? ""}
          placeholder="e.g. Majeedhee Magu"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="o-address">Address</Label>
        <Input id="o-address" name="address" defaultValue={outlet?.address ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Location</Label>
        <LocationPicker defaultLat={outlet?.latitude} defaultLng={outlet?.longitude} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isPrimary" defaultChecked={outlet?.isPrimary ?? false} />
        Primary outlet (its pin represents the merchant)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {outlet ? "Save" : "Add outlet"}
        </Button>
      </div>
    </form>
  );
}

export function OutletsManager({
  merchantId,
  outlets,
  canEdit,
  pinColor,
}: {
  merchantId: string;
  outlets: OutletRow[];
  canEdit: boolean;
  pinColor: { background: string; glyph: string; border: string };
}) {
  const router = useRouter();
  const [formFor, setFormFor] = React.useState<{ outlet: OutletRow | null } | null>(null);
  const [pending, startTransition] = React.useTransition();

  function done() {
    setFormFor(null);
    router.refresh();
  }

  function remove(o: OutletRow) {
    startTransition(async () => {
      const res = await deleteOutletAction(merchantId, o.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Outlet removed");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <OutletsMap outlets={outlets} color={pinColor} />

      <div className="flex flex-col gap-1.5">
        {outlets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No outlets yet.</p>
        ) : (
          outlets.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <MapPinIcon className="text-muted-foreground size-3.5 shrink-0" />
                <span className="min-w-0">
                  <span className="font-medium">{o.name}</span>
                  {o.isPrimary ? (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      Primary
                    </Badge>
                  ) : null}
                  {o.address ? (
                    <span className="text-muted-foreground block truncate text-xs">{o.address}</span>
                  ) : null}
                </span>
              </span>
              {canEdit ? (
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Edit ${o.name}`}
                    onClick={() => setFormFor({ outlet: o })}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive size-7"
                    aria-label={`Remove ${o.name}`}
                    disabled={pending}
                    onClick={() => remove(o)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canEdit && formFor ? (
        <OutletForm
          merchantId={merchantId}
          outlet={formFor.outlet}
          onDone={done}
          onCancel={() => setFormFor(null)}
        />
      ) : canEdit ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setFormFor({ outlet: null })}>
          <PlusIcon /> Add outlet
        </Button>
      ) : null}
    </div>
  );
}
