"use client";

import * as React from "react";
import {
  GiftIcon,
  LibraryIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteCuratedRewardAction,
  saveCuratedRewardAction,
  setCuratedRewardStatusAction,
} from "@/app/(app)/merchants/reward-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

export type CuratedRewardRow = {
  id: string;
  title: string;
  description: string | null;
  mechanic: "STAMP_CARD" | "DISCOUNT" | "FREE_ITEM" | "TIME_LIMITED";
  status: "IDEA" | "PITCHED" | "ACCEPTED" | "DECLINED";
  notes: string | null;
  createdByName: string;
};

export type LibraryIdea = {
  id: string;
  title: string;
  description: string | null;
  mechanic: CuratedRewardRow["mechanic"];
  category: string | null;
};

const MECHANICS = [
  { value: "STAMP_CARD", label: "Stamp / points" },
  { value: "DISCOUNT", label: "Discount" },
  { value: "FREE_ITEM", label: "Free item" },
  { value: "TIME_LIMITED", label: "Time-limited" },
] as const;

const mechanicLabel = (v: string) => MECHANICS.find((m) => m.value === v)?.label ?? v;

// Status is the reward's life with the merchant. Idea = not shown yet;
// pitched = waiting on them; accepted/declined = their answer.
const STATUSES: { value: CuratedRewardRow["status"]; label: string; className: string }[] = [
  { value: "IDEA", label: "Idea", className: "bg-muted text-muted-foreground" },
  {
    value: "PITCHED",
    label: "Pitched",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  {
    value: "ACCEPTED",
    label: "Accepted",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    value: "DECLINED",
    label: "Declined",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
];

function RewardForm({
  merchantId,
  reward,
  onDone,
  onCancel,
}: {
  merchantId: string;
  reward: CuratedRewardRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [mechanic, setMechanic] = React.useState<string>(reward?.mechanic ?? "STAMP_CARD");

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await saveCuratedRewardAction(merchantId, reward?.id ?? null, {
        title: formData.get("title"),
        description: formData.get("description"),
        mechanic,
        notes: formData.get("notes"),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(reward ? "Reward updated" : "Reward curated");
      onDone();
    });
  }

  return (
    <form action={submit} className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cr-title">Reward</Label>
        <Input
          id="cr-title"
          name="title"
          defaultValue={reward?.title ?? ""}
          placeholder="e.g. Buy 5 coffees, get the 6th free"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cr-desc">Merchant-facing wording (optional)</Label>
        <Textarea
          id="cr-desc"
          name="description"
          defaultValue={reward?.description ?? ""}
          rows={2}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Mechanic</Label>
          <Select value={mechanic} onValueChange={setMechanic}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MECHANICS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cr-notes">Notes (optional)</Label>
          <Input
            id="cr-notes"
            name="notes"
            defaultValue={reward?.notes ?? ""}
            placeholder="e.g. wants it weekends only"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {reward ? "Save" : "Add reward"}
        </Button>
      </div>
    </form>
  );
}

// The library picker. Ideas for the merchant's own category first, then the
// any-category evergreens; other categories are deliberately not offered.
function LibraryPicker({
  merchantId,
  ideas,
  category,
  onDone,
  onCancel,
}: {
  merchantId: string;
  ideas: LibraryIdea[];
  category: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const fitting = React.useMemo(() => {
    const own = ideas.filter((i) => i.category != null && i.category === category);
    const any = ideas.filter((i) => i.category == null);
    return [...own, ...any];
  }, [ideas, category]);

  function pick(idea: LibraryIdea) {
    setPendingId(idea.id);
    startTransition(async () => {
      const res = await saveCuratedRewardAction(merchantId, null, { templateId: idea.id });
      setPendingId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`“${idea.title}” curated`);
      onDone();
    });
  }

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">From the library</p>
        <Button variant="ghost" size="icon" className="size-6" onClick={onCancel}>
          <XIcon className="size-3.5" />
        </Button>
      </div>
      {fitting.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          The library has no ideas{category ? ` for ${category}` : ""} yet — an admin can add some
          in Settings, or write one from scratch here.
        </p>
      ) : (
        fitting.map((idea) => (
          <button
            key={idea.id}
            type="button"
            disabled={pendingId != null}
            onClick={() => pick(idea)}
            className="hover:border-primary flex flex-col gap-0.5 rounded-lg border bg-card p-2.5 text-left transition-colors disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm font-medium">{idea.title}</span>
              {pendingId === idea.id ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {mechanicLabel(idea.mechanic)}
                </Badge>
              )}
            </span>
            {idea.description ? (
              <span className="text-muted-foreground line-clamp-2 text-xs">{idea.description}</span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );
}

function RewardRow({
  merchantId,
  reward,
  canEdit,
}: {
  merchantId: string;
  reward: CuratedRewardRow;
  canEdit: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (editing) {
    return (
      <RewardForm
        merchantId={merchantId}
        reward={reward}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const status = STATUSES.find((s) => s.value === reward.status)!;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{reward.title}</p>
          {reward.description ? (
            <p className="text-muted-foreground text-xs">{reward.description}</p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setEditing(true)}
              aria-label="Edit reward"
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive size-7"
              disabled={pending}
              aria-label="Delete reward"
              onClick={() => {
                if (!confirm(`Delete “${reward.title}”?`)) return;
                startTransition(async () => {
                  const res = await deleteCuratedRewardAction(merchantId, reward.id);
                  if (res.error) toast.error(res.error);
                });
              }}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {mechanicLabel(reward.mechanic)}
        </Badge>
        {canEdit ? (
          // The whole workflow is these four chips — tap the merchant's answer.
          STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={pending}
              onClick={() => {
                if (s.value === reward.status) return;
                startTransition(async () => {
                  const res = await setCuratedRewardStatusAction(merchantId, reward.id, s.value);
                  if (res.error) toast.error(res.error);
                });
              }}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity",
                s.className,
                s.value === reward.status ? "" : "opacity-35 hover:opacity-70"
              )}
              aria-pressed={s.value === reward.status}
            >
              {s.label}
            </button>
          ))
        ) : (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", status.className)}>
            {status.label}
          </span>
        )}
      </div>
      {reward.notes ? <p className="text-muted-foreground text-xs italic">“{reward.notes}”</p> : null}
    </div>
  );
}

export function CuratedRewardsCard({
  merchantId,
  category,
  rewards,
  library,
  canEdit,
}: {
  merchantId: string;
  category: string | null;
  rewards: CuratedRewardRow[];
  library: LibraryIdea[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = React.useState<"none" | "library" | "custom">("none");

  const accepted = rewards.filter((r) => r.status === "ACCEPTED").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GiftIcon className="size-4" /> Curated rewards ({rewards.length})
        </CardTitle>
        <CardDescription>
          Reward ideas to pitch to this merchant, so they never face the portal&apos;s blank form.
          {accepted > 0 ? ` ${accepted} accepted so far.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {canEdit && adding === "none" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding("library")}>
              <LibraryIcon className="size-4" /> Add from library
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding("custom")}>
              <PlusIcon className="size-4" /> Write custom
            </Button>
          </div>
        ) : null}

        {adding === "library" ? (
          <LibraryPicker
            merchantId={merchantId}
            ideas={library}
            category={category}
            onDone={() => setAdding("none")}
            onCancel={() => setAdding("none")}
          />
        ) : null}
        {adding === "custom" ? (
          <RewardForm
            merchantId={merchantId}
            reward={null}
            onDone={() => setAdding("none")}
            onCancel={() => setAdding("none")}
          />
        ) : null}

        {rewards.length === 0 && adding === "none" ? (
          <p className="text-muted-foreground text-sm">
            Nothing curated yet{canEdit ? " — pull an idea from the library to get started." : "."}
          </p>
        ) : null}

        {rewards.map((r) => (
          <RewardRow key={r.id} merchantId={merchantId} reward={r} canEdit={canEdit} />
        ))}
      </CardContent>
    </Card>
  );
}
