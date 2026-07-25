"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { APIProvider, AdvancedMarker, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import { CircleIcon, PentagonIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteGeofenceAction, saveGeofenceAction } from "@/app/(app)/zones/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  MAPS_ENABLED,
  type MerchantPin,
  pinColors,
} from "@/lib/maps";
import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";

export type ZoneData = {
  id: string;
  name: string;
  type: "TERRITORY" | "CAMPAIGN";
  shape: "POLYGON" | "CIRCLE";
  color: string;
  points: LatLng[];
  radiusM: number | null;
  offer: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdById: string;
  stats: { total: number; onboarded: number; active: number; prospect: number; mrrMvr: number };
};

type DrawMode = "none" | "polygon" | "circle";

const COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#db2777", "#7c3aed", "#dc2626"];
const money = (n: number) => `MVR ${Math.round(n).toLocaleString("en-US")}`;

// ---- imperative overlays (DrawingManager was removed from Maps JS 3.65, so we
// build shapes from map clicks and render them ourselves) ---------------------

function useShapeOverlay(
  factory: () => google.maps.Polygon | google.maps.Circle | null,
  deps: React.DependencyList
) {
  const map = useMap();
  React.useEffect(() => {
    if (!map) return;
    const overlay = factory();
    if (!overlay) return;
    overlay.setMap(map);
    return () => overlay.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}

function ZoneOverlay({
  zone,
  selected,
  onSelect,
}: {
  zone: ZoneData;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const onSelectRef = React.useRef(onSelect);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  React.useEffect(() => {
    if (!map) return;
    const opts: google.maps.PolygonOptions & google.maps.CircleOptions = {
      strokeColor: zone.color,
      strokeWeight: selected ? 3 : 1.5,
      strokeOpacity: 0.9,
      fillColor: zone.color,
      fillOpacity: selected ? 0.25 : 0.1,
      clickable: true,
      map,
    };
    const overlay =
      zone.shape === "CIRCLE"
        ? new google.maps.Circle({ ...opts, center: zone.points[0], radius: zone.radiusM ?? 0 })
        : new google.maps.Polygon({ ...opts, paths: zone.points });
    const listener = overlay.addListener("click", () => onSelectRef.current(zone.id));
    return () => {
      listener.remove();
      overlay.setMap(null);
    };
  }, [map, zone, selected]);

  return null;
}

// The in-progress shape while drawing.
function DraftOverlay({
  mode,
  points,
  radiusM,
  color,
}: {
  mode: DrawMode;
  points: LatLng[];
  radiusM: number;
  color: string;
}) {
  useShapeOverlay(() => {
    if (mode === "polygon" && points.length >= 2) {
      return new google.maps.Polygon({
        paths: points,
        strokeColor: color,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.12,
      });
    }
    if (mode === "circle" && points.length === 1) {
      return new google.maps.Circle({
        center: points[0],
        radius: radiusM,
        strokeColor: color,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.12,
      });
    }
    return null;
  }, [mode, JSON.stringify(points), radiusM, color]);

  // Vertex dots for the polygon in progress.
  return (
    <>
      {mode === "polygon"
        ? points.map((p, i) => (
            <AdvancedMarker key={i} position={p}>
              <span
                className="block size-2.5 rounded-full border-2 border-white"
                style={{ background: color }}
              />
            </AdvancedMarker>
          ))
        : null}
    </>
  );
}

// Bridges Map clicks to the parent while drawing.
function MapClicks({ onClick }: { onClick: (p: LatLng) => void }) {
  const map = useMap();
  const onClickRef = React.useRef(onClick);
  React.useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);
  React.useEffect(() => {
    if (!map) return;
    const l = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onClickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => l.remove();
  }, [map]);
  return null;
}

// ---- form --------------------------------------------------------------------

type FormState = {
  id: string | null;
  name: string;
  type: "TERRITORY" | "CAMPAIGN";
  color: string;
  ownerId: string;
  offer: string;
};

function ZoneForm({
  form,
  setForm,
  owners,
  showRadius,
  radiusM,
  setRadiusM,
  saving,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  owners: { id: string; name: string }[];
  showRadius: boolean;
  radiusM: number;
  setRadiusM: (n: number) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{form.id ? "Edit zone" : "Name your zone"}</p>
        <Button variant="ghost" size="icon" className="size-6" onClick={onCancel}>
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="z-name">Name</Label>
        <Input
          id="z-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Malé Central"
          autoFocus
        />
      </div>
      {showRadius ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="z-radius">Radius (meters)</Label>
          <Input
            id="z-radius"
            type="number"
            min={50}
            value={radiusM}
            onChange={(e) => setRadiusM(Math.max(50, Number(e.target.value) || 0))}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="z-type">Type</Label>
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as FormState["type"] })}>
          <SelectTrigger id="z-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TERRITORY">Territory</SelectItem>
            <SelectItem value="CAMPAIGN">Campaign</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setForm({ ...form, color: c })}
              className={cn(
                "size-6 rounded-full border-2",
                form.color === c ? "border-foreground" : "border-transparent"
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="z-owner">Assigned rep</Label>
        <Select
          value={form.ownerId || "none"}
          onValueChange={(v) => setForm({ ...form, ownerId: v === "none" ? "" : v })}
        >
          <SelectTrigger id="z-owner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {form.type === "CAMPAIGN" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="z-offer">Offer / note</Label>
          <Textarea
            id="z-offer"
            rows={2}
            value={form.offer}
            onChange={(e) => setForm({ ...form, offer: e.target.value })}
            placeholder="e.g. Ramadan double points around the market"
          />
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || !form.name.trim()}>
          {form.id ? "Save" : "Create zone"}
        </Button>
      </div>
    </div>
  );
}

// ---- main --------------------------------------------------------------------

export function ZonesClient({
  zones,
  pins,
  owners,
  currentUserId,
  isAdmin,
}: {
  zones: ZoneData[];
  pins: MerchantPin[];
  owners: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<DrawMode>("none");
  const [draftPts, setDraftPts] = React.useState<LatLng[]>([]);
  const [radiusM, setRadiusM] = React.useState(500);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [saving, setSaving] = React.useState(false);

  const onSelect = React.useCallback((id: string) => setSelectedId(id), []);

  function resetDraw() {
    setMode("none");
    setDraftPts([]);
    setForm(null);
  }

  function newForm(): FormState {
    return { id: null, name: "", type: "TERRITORY", color: COLORS[0], ownerId: "", offer: "" };
  }

  function onMapClick(p: LatLng) {
    if (mode === "polygon") {
      setDraftPts((prev) => [...prev, p]);
    } else if (mode === "circle" && draftPts.length === 0) {
      setDraftPts([p]);
      setForm(newForm()); // name + radius next
    }
  }

  function startEdit(z: ZoneData) {
    resetDraw();
    setForm({
      id: z.id,
      name: z.name,
      type: z.type,
      color: z.color,
      ownerId: z.ownerId ?? "",
      offer: z.offer ?? "",
    });
  }

  async function save() {
    if (!form) return;
    const editing = form.id ? zones.find((z) => z.id === form.id) : null;
    const shape = editing?.shape ?? (mode === "circle" ? "CIRCLE" : "POLYGON");
    const points = editing ? editing.points : draftPts;
    const radius = editing ? editing.radiusM : shape === "CIRCLE" ? radiusM : null;

    setSaving(true);
    const res = await saveGeofenceAction(form.id, {
      name: form.name,
      type: form.type,
      shape,
      color: form.color,
      points,
      radiusM: radius,
      offer: form.offer,
      ownerId: form.ownerId,
    });
    setSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success(form.id ? "Zone updated" : "Zone created");
    resetDraw();
    router.refresh();
  }

  async function remove(z: ZoneData) {
    const res = await deleteGeofenceAction(z.id);
    if (res.error) return toast.error(res.error);
    toast.success("Zone deleted");
    if (selectedId === z.id) setSelectedId(null);
    router.refresh();
  }

  if (!MAPS_ENABLED) {
    return (
      <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-1 rounded-lg border text-center text-sm">
        <p className="font-medium">Zones need a Google Maps API key</p>
        <p className="text-xs">
          Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to draw territories and campaign zones.
        </p>
      </div>
    );
  }

  const drawColor = form?.color ?? COLORS[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Sidebar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "polygon" ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setSelectedId(null);
              setForm(null);
              setDraftPts([]);
              setMode(mode === "polygon" ? "none" : "polygon");
            }}
          >
            <PentagonIcon /> Draw area
          </Button>
          <Button
            variant={mode === "circle" ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setSelectedId(null);
              setForm(null);
              setDraftPts([]);
              setMode(mode === "circle" ? "none" : "circle");
            }}
          >
            <CircleIcon /> Draw radius
          </Button>
        </div>

        {mode === "polygon" && !form ? (
          <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
            <p className="text-muted-foreground">
              Click points on the map to outline the area ({draftPts.length} added). Add at least 3,
              then finish.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7"
                disabled={draftPts.length < 3}
                onClick={() => setForm(newForm())}
              >
                Finish area
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setDraftPts([])}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}
        {mode === "circle" && draftPts.length === 0 ? (
          <p className="text-muted-foreground text-xs">Click a point on the map to set the center.</p>
        ) : null}

        {form ? (
          <ZoneForm
            form={form}
            setForm={setForm}
            owners={owners}
            showRadius={!form.id && mode === "circle"}
            radiusM={radiusM}
            setRadiusM={setRadiusM}
            saving={saving}
            onSave={save}
            onCancel={resetDraw}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          {zones.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No zones yet — use “Draw area” or “Draw radius” to create one.
            </p>
          ) : (
            zones.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setSelectedId(z.id === selectedId ? null : z.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
                  selectedId === z.id ? "border-foreground/40 bg-muted/50" : "hover:bg-muted/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: z.color }} />
                  <span className="flex-1 truncate font-medium">{z.name}</span>
                  <Badge variant={z.type === "CAMPAIGN" ? "default" : "secondary"} className="text-[10px]">
                    {z.type === "CAMPAIGN" ? "Campaign" : "Territory"}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {z.stats.total} merchant{z.stats.total === 1 ? "" : "s"} ·{" "}
                  <span className="text-emerald-600 dark:text-emerald-400">{z.stats.onboarded} live</span> ·{" "}
                  {z.stats.active} active · {z.stats.prospect} prospect
                </p>
                <p className="text-muted-foreground text-xs">
                  {money(z.stats.mrrMvr)}/mo{z.ownerName ? ` · ${z.ownerName}` : " · unassigned"}
                </p>
                {z.type === "CAMPAIGN" && z.offer ? <p className="text-xs italic">“{z.offer}”</p> : null}
                {selectedId === z.id ? (
                  <div className="mt-1 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(z);
                      }}
                    >
                      Edit
                    </Button>
                    {z.createdById === currentUserId || isAdmin ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(z);
                        }}
                      >
                        <Trash2Icon className="size-3.5" /> Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Map */}
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <div className="h-[72vh] w-full overflow-hidden rounded-lg border">
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
                <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={p.name}>
                  <Pin background={c.background} glyphColor={c.glyph} borderColor={c.border} scale={0.7} />
                </AdvancedMarker>
              );
            })}
            {zones.map((z) => (
              <ZoneOverlay key={z.id} zone={z} selected={selectedId === z.id} onSelect={onSelect} />
            ))}
            {mode !== "none" ? <MapClicks onClick={onMapClick} /> : null}
            <DraftOverlay mode={mode} points={draftPts} radiusM={radiusM} color={drawColor} />
          </Map>
        </div>
      </APIProvider>
    </div>
  );
}
