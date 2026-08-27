import type { Metadata } from "next";

import { requireUser } from "@/lib/rbac";
import { listHelpCategories } from "@/services/help-center";

import { NewArticleForm } from "./new-article-form";

export const metadata: Metadata = { title: "New help article" };

export default async function NewHelpArticlePage() {
  await requireUser();
  const categories = await listHelpCategories();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New help article</h1>
        <p className="text-muted-foreground text-sm">
          Give it a title and a home — you&apos;ll write the content next.
        </p>
      </div>
      <NewArticleForm
        categories={categories.map((c) => ({ id: c.id, title: c.title }))}
      />
    </div>
  );
}
