"use client";

import * as React from "react";
import { PlusIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  deletePermissionSetAction,
  savePermissionSetAction,
  setDefaultPermissionSetAction,
} from "@/app/(app)/team/permission-actions";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type PermissionSetRow = {
  id: string;
  name: string;
  description: string | null;
  canExportData: boolean;
  canSeeAllMerchants: boolean;
  canSeeTeamNumbers: boolean;
  isDefault: boolean;
  userCount: number;
};

// Plain-language labels — an admin shouldn't have to read the schema to know
// what a switch does.
const CAPABILITIES: {
  key: "canExportData" | "canSeeAllMerchants" | "canSeeTeamNumbers";
  label: string;
  help: string;
}[] = [
  {
    key: "canExportData",
    label: "Download data",
    help: "Export merchants, contacts, deals and leads as CSV.",
  },
  {
    key: "canSeeAllMerchants",
    label: "See everyone's merchants",
    help: "Off means they see only their own book, plus anything shared with them.",
  },
  {
    key: "canSeeTeamNumbers",
    label: "See team numbers",
    help: "The per-rep breakdown on the dashboard.",
  },
];

type Draft = {
  name: string;
  description: string;
  canExportData: boolean;
  canSeeAllMerchants: boolean;
  canSeeTeamNumbers: boolean;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  canExportData: false,
  canSeeAllMerchants: true,
  canSeeTeamNumbers: true,
};

export function PermissionSetsCard({ sets }: { sets: PermissionSetRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, start] = React.useTransition();

  function beginNew() {
    setEditingId("new");
    setDraft(emptyDraft);
  }

  function beginEdit(set: PermissionSetRow) {
    setEditingId(set.id);
    setDraft({
      name: set.name,
      description: set.description ?? "",
      canExportData: set.canExportData,
      canSeeAllMerchants: set.canSeeAllMerchants,
      canSeeTeamNumbers: set.canSeeTeamNumbers,
    });
  }

  function save() {
    if (!draft) return;
    start(async () => {
      const result = await savePermissionSetAction(editingId === "new" ? null : editingId, draft);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Permission set saved");
      setEditingId(null);
      setDraft(null);
    });
  }

  function remove(set: PermissionSetRow) {
    start(async () => {
      const result = await deletePermissionSetAction(set.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`“${set.name}” deleted`);
    });
  }

  function makeDefault(set: PermissionSetRow) {
    start(async () => {
      const result = await setDefaultPermissionSetAction(set.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`“${set.name}” is now the default`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheckIcon className="size-4" /> Permission sets
        </CardTitle>
        <CardDescription>
          What sales reps can do. Admins always have full access and aren&apos;t affected by these.
          Anyone without their own set gets the default.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sets.map((set) => (
          <div key={set.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{set.name}</span>
              {set.isDefault ? (
                <Badge
                  variant="outline"
                  className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                >
                  Default
                </Badge>
              ) : null}
              <span className="text-muted-foreground text-xs">
                {set.userCount} {set.userCount === 1 ? "person" : "people"}
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7" onClick={() => beginEdit(set)}>
                  Edit
                </Button>
                {!set.isDefault ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={pending}
                      onClick={() => makeDefault(set)}
                    >
                      Make default
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7"
                      disabled={pending}
                      onClick={() => remove(set)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {set.description ? (
              <p className="text-muted-foreground mt-1 text-xs">{set.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CAPABILITIES.map((cap) => (
                <Badge
                  key={cap.key}
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    set[cap.key]
                      ? "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground line-through"
                  )}
                >
                  {cap.label}
                </Badge>
              ))}
            </div>

            {editingId === set.id && draft ? (
              <Editor draft={draft} setDraft={setDraft} pending={pending} onSave={save} onCancel={() => setEditingId(null)} />
            ) : null}
          </div>
        ))}

        {editingId === "new" && draft ? (
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">New permission set</p>
            <Editor draft={draft} setDraft={setDraft} pending={pending} onSave={save} onCancel={() => setEditingId(null)} />
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-fit" onClick={beginNew}>
            <PlusIcon /> New permission set
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Editor({
  draft,
  setDraft,
  pending,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-3 border-t pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ps-name">Name</Label>
          <Input
            id="ps-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Field rep"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ps-desc">Description</Label>
          <Input
            id="ps-desc"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="What this set is for"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {CAPABILITIES.map((cap) => (
          <div key={cap.key} className="flex items-start gap-3">
            <Switch
              id={`ps-${cap.key}`}
              checked={draft[cap.key]}
              onCheckedChange={(v) => setDraft({ ...draft, [cap.key]: v })}
            />
            <div className="flex flex-col">
              <Label htmlFor={`ps-${cap.key}`} className="cursor-pointer">
                {cap.label}
              </Label>
              <span className="text-muted-foreground text-xs">{cap.help}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending || !draft.name.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
