"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { Value } from "platejs";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

import {
  deleteArticleAction,
  publishArticleAction,
  rejectArticleAction,
  saveArticleAction,
  submitForReviewAction,
  unpublishArticleAction,
} from "../actions";
import { HelpPlateEditor, type HelpEditorHandle } from "./plate-editor";

type ArticleProps = {
  id: string;
  title: string;
  slug: string;
  description: string;
  categoryId: string;
  categorySlug: string;
  order: number;
  status: string;
  contentJson: object[];
  reviewNote: string | null;
  authorName: string | null;
  reviewerName: string | null;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

export function ArticleEditor({
  article,
  categories,
  canEdit,
  isAdmin,
}: {
  article: ArticleProps;
  categories: { id: string; title: string }[];
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const editorRef = React.useRef<HelpEditorHandle>(null);
  const [title, setTitle] = React.useState(article.title);
  const [slug, setSlug] = React.useState(article.slug);
  const [description, setDescription] = React.useState(article.description);
  const [categoryId, setCategoryId] = React.useState(article.categoryId);
  const [order, setOrder] = React.useState(article.order);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const save = async (): Promise<boolean> => {
    const value = editorRef.current?.getValue();
    if (!value) return false;
    setBusy("save");
    setError(null);
    const res = await saveArticleAction(
      article.id,
      { title, slug, description, categoryId, order },
      value
    );
    setBusy(null);
    if (res.error) {
      setError(
        res.fieldErrors ? `${res.error}: ${Object.values(res.fieldErrors).join("; ")}` : res.error
      );
      return false;
    }
    toast.success("Saved");
    return true;
  };

  const run = async (
    key: string,
    fn: () => Promise<{ error: string | null }>,
    successMsg: string,
    saveFirst = true
  ) => {
    if (saveFirst && canEdit) {
      const ok = await save();
      if (!ok) return;
    }
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error) setError(res.error);
    else toast.success(successMsg);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/help-center">
              <ArrowLeftIcon /> Back
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{article.title}</h1>
            <p className="text-muted-foreground text-xs">
              /{article.categorySlug}/{article.slug} · by {article.authorName ?? "unknown"}
            </p>
          </div>
          <Badge variant="outline">{STATUS_LABELS[article.status] ?? article.status}</Badge>
          {article.hasUnpublishedChanges && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Unpublished changes
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => void save()} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
          )}
          {canEdit && !isAdmin && article.status !== "IN_REVIEW" && article.status !== "PUBLISHED" && (
            <Button
              onClick={() =>
                void run("submit", () => submitForReviewAction(article.id), "Submitted for review")
              }
              disabled={busy !== null}
            >
              <SendIcon /> {busy === "submit" ? "Submitting…" : "Submit for review"}
            </Button>
          )}
          {isAdmin && (
            <Button
              onClick={() =>
                void run(
                  "publish",
                  () => publishArticleAction(article.id),
                  "Published — the site is rebuilding"
                )
              }
              disabled={busy !== null}
            >
              <CheckIcon /> {busy === "publish" ? "Publishing…" : article.status === "PUBLISHED" ? "Publish changes" : "Approve & publish"}
            </Button>
          )}
          {isAdmin && article.status === "IN_REVIEW" && (
            <Button
              variant="outline"
              onClick={() => {
                const note = window.prompt("What needs to change? (sent to the author)") ?? "";
                if (!note) return;
                void run("reject", () => rejectArticleAction(article.id, note), "Sent back to author", false);
              }}
              disabled={busy !== null}
            >
              <XIcon /> Request changes
            </Button>
          )}
          {isAdmin && article.status === "PUBLISHED" && (
            <Button
              variant="outline"
              onClick={() =>
                void run("unpublish", () => unpublishArticleAction(article.id), "Unpublished", false)
              }
              disabled={busy !== null}
            >
              Unpublish
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (!window.confirm("Delete this article? This cannot be undone.")) return;
                void run("delete", () => deleteArticleAction(article.id), "Deleted", false);
              }}
              disabled={busy !== null}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {article.status === "REJECTED" && article.reviewNote ? (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Changes requested by {article.reviewerName ?? "admin"}:</span>{" "}
            {article.reviewNote}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="py-0">
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5 lg:col-span-1">
            <Label htmlFor="a-title">Title</Label>
            <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-slug">Slug</Label>
            <Input id="a-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-cat">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={!canEdit}>
              <SelectTrigger id="a-cat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-order">Order in category</Label>
            <Input
              id="a-order"
              type="number"
              min={0}
              max={999}
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="a-desc">Short description</Label>
            <Input
              id="a-desc"
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      <HelpPlateEditor
        ref={editorRef}
        initialValue={article.contentJson as Value}
        readOnly={!canEdit}
      />

      <p className="text-muted-foreground text-xs">
        Tip: use Heading 2 for sections (they become the article&apos;s table of contents), the
        quote button for green tip callouts, and image URLs like
        <code className="mx-1 rounded border px-1">/screenshots/name.jpg</code> for screenshots
        already on the help site.
      </p>
    </div>
  );
}
