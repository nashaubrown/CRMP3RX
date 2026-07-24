"use client";

import * as React from "react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  addOptionAction,
  renameOptionAction,
  setOptionArchivedAction,
  setOptionPricingAction,
} from "@/app/(app)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Option = {
  id: string;
  label: string;
  archived: boolean;
  priceMvr: number | null;
  perLocation: boolean;
};
type OptionSet = {
  key: string;
  label: string;
  description: string;
  priced: boolean;
  options: Option[];
};

// Price (MVR) + per-location editor for a priced option (subscription plan).
function PricingRow({ option }: { option: Option }) {
  const [pending, startTransition] = React.useTransition();
  const [price, setPrice] = React.useState(option.priceMvr?.toString() ?? "");
  const [perLocation, setPerLocation] = React.useState(option.perLocation);

  function save(nextPrice: string, nextPer: boolean) {
    const parsed = nextPrice.trim() === "" ? null : Number(nextPrice);
    startTransition(async () => {
      const res = await setOptionPricingAction(option.id, parsed, nextPer);
      if (res.error) toast.error(res.error);
    });
  }

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 pl-2 text-xs">
      <span>MVR</span>
      <Input
        type="number"
        min={0}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={() => save(price, perLocation)}
        className="h-7 w-24"
        placeholder="0"
        disabled={pending}
      />
      <label className="flex items-center gap-1.5">
        <Switch
          checked={perLocation}
          onCheckedChange={(v) => {
            setPerLocation(v);
            save(price, v);
          }}
          disabled={pending}
        />
        per location
      </label>
      <span>/ month</span>
    </div>
  );
}

function OptionRow({ option, priced }: { option: Option; priced: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(option.label);

  function save() {
    const next = value.trim();
    if (!next || next === option.label) {
      setEditing(false);
      setValue(option.label);
      return;
    }
    startTransition(async () => {
      const res = await renameOptionAction(option.id, next);
      if (res.error) {
        toast.error(res.error);
        setValue(option.label);
      } else {
        toast.success("Renamed");
      }
      setEditing(false);
    });
  }

  function toggleArchive() {
    startTransition(async () => {
      const res = await setOptionArchivedAction(option.id, !option.archived);
      if (res.error) toast.error(res.error);
      else toast.success(option.archived ? "Restored" : "Archived");
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-2 py-1.5",
        option.archived && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
      {editing ? (
        <>
          <Input
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditing(false);
                setValue(option.label);
              }
            }}
            className="h-7 flex-1"
          />
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={save} disabled={pending}>
            {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => {
              setEditing(false);
              setValue(option.label);
            }}
          >
            <XIcon className="size-3.5" />
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-sm">{option.label}</span>
          {option.archived ? <Badge variant="outline">Archived</Badge> : null}
          {!option.archived ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Rename ${option.label}`}
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={option.archived ? `Restore ${option.label}` : `Archive ${option.label}`}
            onClick={toggleArchive}
            disabled={pending}
          >
            {option.archived ? (
              <ArchiveRestoreIcon className="size-3.5" />
            ) : (
              <ArchiveIcon className="size-3.5" />
            )}
          </Button>
        </>
      )}
      </div>
      {priced && !option.archived ? <PricingRow option={option} /> : null}
    </div>
  );
}

function OptionSetBlock({ set }: { set: OptionSet }) {
  const [pending, startTransition] = React.useTransition();
  const [adding, setAdding] = React.useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    const label = adding.trim();
    if (!label) return;
    startTransition(async () => {
      const res = await addOptionAction(set.key, label);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Added "${label}"`);
        setAdding("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{set.label}</p>
        <p className="text-muted-foreground text-xs">{set.description}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {set.options.map((o) => (
          <OptionRow key={o.id} option={o} priced={set.priced} />
        ))}
        {set.options.length === 0 ? (
          <p className="text-muted-foreground text-sm">No values yet.</p>
        ) : null}
      </div>
      <form onSubmit={add} className="flex gap-2">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder={`Add a ${set.label.toLowerCase()}…`}
          maxLength={80}
          className="max-w-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !adding.trim()}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
        </Button>
      </form>
    </div>
  );
}

export function OptionSetsCard({ sets }: { sets: OptionSet[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dropdown values</CardTitle>
        <CardDescription>
          Manage the option lists used across the app. Archiving hides a value from new records but
          keeps it on existing ones.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {sets.map((set) => (
          <OptionSetBlock key={set.key} set={set} />
        ))}
      </CardContent>
    </Card>
  );
}
