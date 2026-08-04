"use client";

import * as React from "react";
import { useActionState } from "react";
import { HammerIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createCategoryAction,
  importFromHelpSiteAction,
  deleteCategoryAction,
  rebuildSiteAction,
  saveHelpSettingsAction,
  updateCategoryAction,
  type HelpFormState,
} from "../actions";

const initialState: HelpFormState = { error: null };

export function HelpSettingsForm({
  defaults,
}: {
  defaults: { netlifyBuildHookUrl: string; siteUrl: string };
}) {
  const [state, formAction, pending] = useActionState(saveHelpSettingsAction, initialState);
  const [rebuilding, setRebuilding] = React.useState(false);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Publishing</h2>
          <p className="text-muted-foreground text-sm">
            When an article is published, the CRM calls this Netlify build hook so the public
            site rebuilds with the new content (takes about a minute).
          </p>
        </div>
        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hook">Netlify build hook URL</Label>
            <Input
              id="hook"
              name="netlifyBuildHookUrl"
              placeholder="https://api.netlify.com/build_hooks/…"
              defaultValue={defaults.netlifyBuildHookUrl}
            />
            {state.fieldErrors?.netlifyBuildHookUrl ? (
              <p className="text-destructive text-xs">{state.fieldErrors.netlifyBuildHookUrl}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Netlify → your site → Site configuration → Build &amp; deploy → Build hooks → Add
              build hook, then paste the URL here.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="siteUrl">Public help site URL</Label>
            <Input
              id="siteUrl"
              name="siteUrl"
              placeholder="https://perx-help-center.netlify.app"
              defaultValue={defaults.siteUrl}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={rebuilding}
              onClick={async () => {
                setRebuilding(true);
                const res = await rebuildSiteAction();
                setRebuilding(false);
                if (res.error) toast.error(res.error);
                else toast.success("Rebuild triggered — live in about a minute");
              }}
            >
              <HammerIcon /> {rebuilding ? "Triggering…" : "Rebuild site now"}
            </Button>
            <ImportButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type Category = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  articleCount: number;
};

function CategoryRow({ category }: { category: Category }) {
  const action = updateCategoryAction.bind(null, category.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [deleting, setDeleting] = React.useState(false);

  return (
    <form action={formAction} className="grid items-end gap-2 border-t py-3 sm:grid-cols-[90px_1fr_1fr_90px_auto]">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Order</Label>
        <Input name="order" type="number" defaultValue={category.order} min={0} max={999} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Title</Label>
        <Input name="title" defaultValue={category.title} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Description</Label>
        <Input name="description" defaultValue={category.description} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Icon</Label>
        <Input name="icon" defaultValue={category.icon} />
      </div>
      <div className="flex items-center gap-1">
        <input type="hidden" name="slug" value={category.slug} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={deleting || category.articleCount > 0}
          title={
            category.articleCount > 0
              ? `Has ${category.articleCount} articles — move them first`
              : "Delete category"
          }
          onClick={async () => {
            if (!window.confirm(`Delete category "${category.title}"?`)) return;
            setDeleting(true);
            const res = await deleteCategoryAction(category.id);
            setDeleting(false);
            if (res.error) toast.error(res.error);
          }}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-xs sm:col-span-5">{state.error}</p>
      ) : null}
    </form>
  );
}

export function CategoriesManager({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState(createCategoryAction, initialState);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Categories</h2>
          <p className="text-muted-foreground text-sm">
            The topic groups on the public help site. Icons: rocket, chart, users, gift, qr,
            settings, team, card.
          </p>
        </div>

        <div>
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </div>

        <form action={formAction} className="grid items-end gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          {state.error ? (
            <p className="text-destructive text-xs sm:col-span-4">{state.error}</p>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">New category title</Label>
            <Input name="title" placeholder="e.g. Integrations" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Slug</Label>
            <Input name="slug" placeholder="integrations" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Description</Label>
            <Input name="description" placeholder="Shown under the title" />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            <PlusIcon /> {pending ? "Adding…" : "Add"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ImportButton() {
  const [importing, setImporting] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={importing}
      onClick={async () => {
        const url = window.prompt(
          "URL of the help site export",
          "https://perx-help-center.netlify.app/export.json"
        );
        if (!url) return;
        setImporting(true);
        const res = await importFromHelpSiteAction(url);
        setImporting(false);
        if (res.error) toast.error(res.error);
        else toast.success("Import finished — see the article list");
      }}
    >
      {importing ? "Importing…" : "Import articles from help site"}
    </Button>
  );
}
