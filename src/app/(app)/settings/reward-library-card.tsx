"use client";

import * as React from "react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  GiftIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  saveRewardTemplateAction,
  setRewardTemplateArchivedAction,
} from "@/app/(app)/settings/reward-library-actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type RewardTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  mechanic: "STAMP_CARD" | "DISCOUNT" | "FREE_ITEM" | "TIME_LIMITED";
  category: string | null;
  archived: boolean;
};

const MECHANICS = [
  { value: "STAMP_CARD", label: "Stamp / points" },
  { value: "DISCOUNT", label: "Discount" },
  { value: "FREE_ITEM", label: "Free item" },
  { value: "TIME_LIMITED", label: "Time-limited" },
] as const;

// "Any category" needs a real sentinel: Radix Select can't represent "".
const ANY = "__any__";

function TemplateForm({
  template,
  categories,
  onDone,
  onCancel,
}: {
  template: RewardTemplateRow | null;
  categories: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [mechanic, setMechanic] = React.useState<string>(template?.mechanic ?? "STAMP_CARD");
  const [category, setCategory] = React.useState<string>(template?.category ?? ANY);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await saveRewardTemplateAction(template?.id ?? null, {
        title: formData.get("title"),
        description: formData.get("description"),
        mechanic,
        category: category === ANY ? "" : category,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(template ? "Idea updated" : "Idea added to the library");
      onDone();
    });
  }

  return (
    <form action={submit} className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rt-title">Idea</Label>
        <Input
          id="rt-title"
          name="title"
          defaultValue={template?.title ?? ""}
          placeholder="e.g. Buy 5 coffees, get the 6th free"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rt-desc">Merchant-facing wording (optional)</Label>
        <Textarea
          id="rt-desc"
          name="description"
          defaultValue={template?.description ?? ""}
          placeholder="The line the merchant would put on the reward itself."
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
          <Label>Fits category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {template ? "Save" : "Add idea"}
        </Button>
      </div>
    </form>
  );
}

function TemplateRow({
  template,
  categories,
}: {
  template: RewardTemplateRow;
  categories: string[];
}) {
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (editing) {
    return (
      <TemplateForm
        template={template}
        categories={categories}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const mechanicLabel = MECHANICS.find((m) => m.value === template.mechanic)?.label;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 rounded-lg border p-2.5",
        template.archived && "opacity-60"
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{template.title}</p>
        {template.description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs">{template.description}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {mechanicLabel}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {template.category ?? "Any category"}
          </Badge>
          {template.archived ? (
            <Badge variant="outline" className="text-[10px]">
              Archived
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setEditing(true)}
          aria-label="Edit idea"
        >
          <PencilIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={pending}
          aria-label={template.archived ? "Restore idea" : "Archive idea"}
          onClick={() =>
            startTransition(async () => {
              const res = await setRewardTemplateArchivedAction(template.id, !template.archived);
              if (res.error) toast.error(res.error);
            })
          }
        >
          {template.archived ? (
            <ArchiveRestoreIcon className="size-3.5" />
          ) : (
            <ArchiveIcon className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

// Admin-managed library of reward ideas, grouped by the category they fit.
// Ideas are archived rather than deleted so curated rewards keep provenance.
export function RewardLibraryCard({
  templates,
  categories,
}: {
  templates: RewardTemplateRow[];
  categories: string[];
}) {
  const [adding, setAdding] = React.useState(false);

  // Group by category, "Any category" first — matching how reps encounter
  // them on a merchant: general ideas plus the merchant's own category.
  const groups = React.useMemo(() => {
    const by = new Map<string, RewardTemplateRow[]>();
    for (const t of templates) {
      const key = t.category ?? "";
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(t);
    }
    return [...by.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [templates]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GiftIcon className="size-4" /> Reward library
        </CardTitle>
        <CardDescription>
          Curated reward ideas your team pitches to merchants, tagged by the category they fit.
          Reps pull these in on a merchant&apos;s page — merchants still create the real reward in
          their portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding ? (
          <TemplateForm
            template={null}
            categories={categories}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" /> Add idea
          </Button>
        )}

        {groups.length === 0 && !adding ? (
          <p className="text-muted-foreground text-sm">
            No ideas yet. Start with your evergreens — &quot;buy 5 get 1 free&quot;, &quot;10% off
            second visit&quot; — then add category-specific ones.
          </p>
        ) : null}

        {groups.map(([category, rows]) => (
          <div key={category || "any"} className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {category || "Any category"}
            </p>
            {rows.map((t) => (
              <TemplateRow key={t.id} template={t} categories={categories} />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
