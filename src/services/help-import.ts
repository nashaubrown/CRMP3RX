// One-time bootstrap: imports the help site's original markdown articles
// (published as export.json on the public site) into the Help Center tables,
// converting markdown → Plate JSON with the same plugin set the editor uses.

import { createSlateEditor } from "platejs";
import { MarkdownPlugin } from "@platejs/markdown";
import remarkGfm from "remark-gfm";
import { BaseTablePlugin } from "@platejs/table";
import { BaseLinkPlugin } from "@platejs/link";
import { BaseImagePlugin } from "@platejs/media";
import { BaseListPlugin } from "@platejs/list";
import {
  BaseBlockquotePlugin,
  BaseBoldPlugin,
  BaseCodePlugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseItalicPlugin,
  BaseUnderlinePlugin,
} from "@platejs/basic-nodes";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { plateToHtml, type PlateNode } from "@/lib/help-html";
import { HelpCenterError } from "@/services/help-center";

type ExportPayload = {
  categories: {
    slug: string;
    title: string;
    description: string;
    icon: string;
    order: number;
    articles: {
      slug: string;
      title: string;
      description: string;
      order: number;
      markdown: string;
    }[];
  }[];
};

function markdownEditor() {
  return createSlateEditor({
    plugins: [
      BaseBlockquotePlugin,
      BaseBoldPlugin,
      BaseCodePlugin,
      BaseH2Plugin,
      BaseH3Plugin,
      BaseItalicPlugin,
      BaseUnderlinePlugin,
      BaseLinkPlugin,
      BaseImagePlugin,
      BaseListPlugin,
      BaseTablePlugin,
      MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
    ],
  });
}

export async function importFromHelpSite(
  ctx: SessionUser,
  url: string
): Promise<{ categories: number; created: number; skipped: number }> {
  if (!isAdmin(ctx)) throw new HelpCenterError("Only admins can import");

  let payload: ExportPayload;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = (await res.json()) as ExportPayload;
  } catch (e) {
    throw new HelpCenterError(
      `Could not fetch export.json: ${e instanceof Error ? e.message : "unknown error"}`
    );
  }
  if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
    throw new HelpCenterError("export.json has no categories");
  }

  const editor = markdownEditor();
  let created = 0;
  let skipped = 0;

  for (const cat of payload.categories) {
    const category = await db.helpCategory.upsert({
      where: { slug: cat.slug },
      create: {
        slug: cat.slug,
        title: cat.title,
        description: cat.description ?? "",
        icon: cat.icon ?? "chart",
        order: cat.order ?? 99,
      },
      update: {},
    });

    for (const art of cat.articles) {
      const existing = await db.helpArticle.findUnique({
        where: { slug: art.slug },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      const contentJson = editor.api.markdown.deserialize(art.markdown) as PlateNode[];
      const { html } = plateToHtml(contentJson);
      await db.helpArticle.create({
        data: {
          slug: art.slug,
          title: art.title,
          description: art.description ?? "",
          order: art.order ?? 99,
          status: "PUBLISHED",
          categoryId: category.id,
          contentJson: contentJson as object[],
          contentHtml: html,
          publishedTitle: art.title,
          publishedDescription: art.description ?? "",
          publishedJson: contentJson as object[],
          publishedHtml: html,
          publishedAt: new Date(),
          authorId: ctx.id,
          reviewerId: ctx.id,
        },
      });
      created++;
    }
  }

  return { categories: payload.categories.length, created, skipped };
}
