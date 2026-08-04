import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { plateToHtml, type PlateNode } from "@/lib/help-html";
import type {
  HelpArticleMetaInput,
  HelpCategoryInput,
} from "@/lib/validators/help-center";

// Help Center CMS.
// Workflow: anyone drafts; SALES_REP submits for review; ADMIN approves &
// publishes (admins can publish their own work directly). The public site
// only ever sees the published* fields, so edits never take a live page down.

export class HelpCenterError extends Error {}

// ---------- Queries ----------

export async function listHelpCategories() {
  return db.helpCategory.findMany({
    orderBy: [{ order: "asc" }, { title: "asc" }],
    include: { _count: { select: { articles: true } } },
  });
}

export type HelpArticleFilter = {
  status?: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  mine?: boolean;
};

export async function listHelpArticles(ctx: SessionUser, filter: HelpArticleFilter = {}) {
  return db.helpArticle.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mine ? { authorId: ctx.id } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      category: { select: { id: true, title: true, slug: true } },
      author: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });
}

export async function getHelpArticle(id: string) {
  return db.helpArticle.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, title: true, slug: true } },
      author: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });
}

export async function countInReview() {
  return db.helpArticle.count({ where: { status: "IN_REVIEW" } });
}

// ---------- Mutations ----------

function canEdit(ctx: SessionUser, article: { authorId: string | null }) {
  return isAdmin(ctx) || article.authorId === ctx.id;
}

export async function createHelpArticle(ctx: SessionUser, meta: HelpArticleMetaInput) {
  const existing = await db.helpArticle.findUnique({ where: { slug: meta.slug } });
  if (existing) throw new HelpCenterError("An article with this slug already exists");
  const emptyContent: PlateNode[] = [{ type: "p", children: [{ text: "" }] }];
  return db.helpArticle.create({
    data: {
      ...meta,
      contentJson: emptyContent as object[],
      contentHtml: "",
      status: "DRAFT",
      authorId: ctx.id,
    },
  });
}

export async function updateHelpArticle(
  ctx: SessionUser,
  id: string,
  meta: HelpArticleMetaInput,
  contentJson: PlateNode[]
) {
  const article = await db.helpArticle.findUnique({ where: { id } });
  if (!article) throw new HelpCenterError("Article not found");
  if (!canEdit(ctx, article)) throw new HelpCenterError("You can only edit your own articles");
  const clash = await db.helpArticle.findFirst({
    where: { slug: meta.slug, NOT: { id } },
    select: { id: true },
  });
  if (clash) throw new HelpCenterError("An article with this slug already exists");

  const { html } = plateToHtml(contentJson);
  return db.helpArticle.update({
    where: { id },
    data: {
      ...meta,
      contentJson: contentJson as object[],
      contentHtml: html,
      // A rejected article that gets edited goes back to draft.
      ...(article.status === "REJECTED" ? { status: "DRAFT", reviewNote: null } : {}),
    },
  });
}

export async function submitForReview(ctx: SessionUser, id: string) {
  const article = await db.helpArticle.findUnique({ where: { id } });
  if (!article) throw new HelpCenterError("Article not found");
  if (!canEdit(ctx, article)) throw new HelpCenterError("You can only submit your own articles");
  if (article.status === "IN_REVIEW") return article;
  return db.helpArticle.update({
    where: { id },
    data: { status: "IN_REVIEW", submittedAt: new Date(), reviewNote: null },
  });
}

export async function publishHelpArticle(ctx: SessionUser, id: string) {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can publish");
  const article = await db.helpArticle.findUnique({ where: { id } });
  if (!article) throw new HelpCenterError("Article not found");
  const updated = await db.helpArticle.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedTitle: article.title,
      publishedDescription: article.description,
      publishedJson: article.contentJson as object[],
      publishedHtml: article.contentHtml,
      publishedAt: new Date(),
      reviewerId: ctx.id,
      reviewNote: null,
    },
  });
  await triggerSiteBuild();
  return updated;
}

export async function rejectHelpArticle(ctx: SessionUser, id: string, note: string) {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can review");
  const article = await db.helpArticle.findUnique({ where: { id } });
  if (!article) throw new HelpCenterError("Article not found");
  if (article.status !== "IN_REVIEW") throw new HelpCenterError("Article is not in review");
  return db.helpArticle.update({
    where: { id },
    data: { status: "REJECTED", reviewerId: ctx.id, reviewNote: note || "Needs changes" },
  });
}

export async function unpublishHelpArticle(ctx: SessionUser, id: string) {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can unpublish");
  const updated = await db.helpArticle.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      publishedJson: undefined,
      publishedHtml: null,
      publishedTitle: null,
      publishedDescription: null,
    },
  });
  await triggerSiteBuild();
  return updated;
}

export async function deleteHelpArticle(ctx: SessionUser, id: string) {
  const article = await db.helpArticle.findUnique({ where: { id } });
  if (!article) return;
  if (!canEdit(ctx, article)) throw new HelpCenterError("You can only delete your own articles");
  if (article.status === "PUBLISHED" && !isAdmin(ctx))
    throw new HelpCenterError("Only admins can delete published articles");
  await db.helpArticle.delete({ where: { id } });
  if (article.status === "PUBLISHED") await triggerSiteBuild();
}

// ---------- Categories ----------

export async function createHelpCategory(ctx: SessionUser, input: HelpCategoryInput) {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can manage categories");
  const existing = await db.helpCategory.findUnique({ where: { slug: input.slug } });
  if (existing) throw new HelpCenterError("A category with this slug already exists");
  return db.helpCategory.create({ data: input });
}

export async function updateHelpCategory(
  ctx: SessionUser,
  id: string,
  input: HelpCategoryInput
) {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can manage categories");
  return db.helpCategory.update({ where: { id }, data: input });
}

export async function deleteHelpCategory(ctx: SessionUser, id: string) {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can manage categories");
  const count = await db.helpArticle.count({ where: { categoryId: id } });
  if (count > 0) throw new HelpCenterError("Move or delete this category's articles first");
  await db.helpCategory.delete({ where: { id } });
}

// ---------- Settings & site rebuild ----------

export async function getHelpSettings() {
  return db.helpSetting.findUnique({ where: { id: "singleton" } });
}

export async function updateHelpSettings(
  ctx: SessionUser,
  input: { netlifyBuildHookUrl: string; siteUrl: string }
) {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can change settings");
  return db.helpSetting.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      netlifyBuildHookUrl: input.netlifyBuildHookUrl || null,
      siteUrl: input.siteUrl || null,
    },
    update: {
      netlifyBuildHookUrl: input.netlifyBuildHookUrl || null,
      siteUrl: input.siteUrl || null,
    },
  });
}

// Fire the Netlify build hook so the public site rebuilds with the latest
// published content. Failures are swallowed (publishing must not fail because
// the hook is down); the settings page has a manual "Rebuild now" button.
export async function triggerSiteBuild(): Promise<boolean> {
  const settings = await getHelpSettings();
  const hook = settings?.netlifyBuildHookUrl;
  if (!hook) return false;
  try {
    const res = await fetch(hook, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Public payload (consumed by the help site's build) ----------

export async function getPublishedPayload() {
  const categories = await db.helpCategory.findMany({
    orderBy: [{ order: "asc" }, { title: "asc" }],
    include: {
      articles: {
        where: { status: "PUBLISHED" },
        orderBy: [{ order: "asc" }, { title: "asc" }],
        select: {
          slug: true,
          order: true,
          publishedTitle: true,
          publishedDescription: true,
          publishedHtml: true,
          publishedAt: true,
          updatedAt: true,
        },
      },
    },
  });
  return {
    generatedAt: new Date().toISOString(),
    categories: categories
      .map((c) => ({
        slug: c.slug,
        title: c.title,
        description: c.description,
        icon: c.icon,
        order: c.order,
        articles: c.articles
          .filter((a) => a.publishedHtml)
          .map((a) => ({
            slug: a.slug,
            title: a.publishedTitle ?? "",
            description: a.publishedDescription ?? "",
            order: a.order,
            html: a.publishedHtml ?? "",
            updated: (a.publishedAt ?? a.updatedAt).toISOString(),
          })),
      }))
      .filter((c) => c.articles.length > 0),
  };
}
