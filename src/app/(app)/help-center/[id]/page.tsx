import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isAdmin } from "@/lib/authz";
import { requireUser } from "@/lib/rbac";
import { getHelpArticle, listHelpCategories } from "@/services/help-center";

import { ArticleEditor } from "./article-editor";

export const metadata: Metadata = { title: "Edit help article" };

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const article = await getHelpArticle(id);
  if (!article) notFound();
  const categories = await listHelpCategories();

  const admin = isAdmin(user);
  const own = article.authorId === user.id;

  return (
    <ArticleEditor
      article={{
        id: article.id,
        title: article.title,
        slug: article.slug,
        description: article.description,
        categoryId: article.categoryId,
        categorySlug: article.category.slug,
        order: article.order,
        status: article.status,
        contentJson: article.contentJson as object[],
        reviewNote: article.reviewNote,
        authorName: article.author?.name ?? null,
        reviewerName: article.reviewer?.name ?? null,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        hasUnpublishedChanges:
          article.status === "PUBLISHED" &&
          JSON.stringify(article.contentJson) !== JSON.stringify(article.publishedJson),
      }}
      categories={categories.map((c) => ({ id: c.id, title: c.title }))}
      canEdit={admin || own}
      isAdmin={admin}
    />
  );
}
