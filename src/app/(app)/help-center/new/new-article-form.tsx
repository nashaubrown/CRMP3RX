"use client";

import * as React from "react";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createArticleAction, type HelpFormState } from "../actions";

const initialState: HelpFormState = { error: null };

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function NewArticleForm({
  categories,
}: {
  categories: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState(createArticleAction, initialState);
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <input type="hidden" name="categoryId" value={categoryId} />
      <Card>
        <CardContent className="flex flex-col gap-5">
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              value={title}
              placeholder="e.g. Creating a reward — the 5-step wizard"
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
            />
            {errors.title ? <p className="text-destructive text-xs">{errors.title}</p> : null}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">URL slug *</Label>
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                required
              />
              {errors.slug ? <p className="text-destructive text-xs">{errors.slug}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categorySel">Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="categorySel" className="w-full">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId ? (
                <p className="text-destructive text-xs">{errors.categoryId}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Short description</Label>
            <Input
              id="description"
              name="description"
              placeholder="One line shown in lists and search results"
              maxLength={200}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !categoryId}>
              {pending ? "Creating…" : "Create and open editor"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
