import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { listHelpArticles } from "@/services/help-center";
import { quickSearch } from "@/services/search";

// The Help Center list searches article bodies as well as their metadata, so
// you can find an article by something mentioned inside it. ⌘K carries
// articles too, but on metadata only.

const suffix = `hs-${Math.random().toString(36).slice(2, 8)}`;
const bodyWord = `Wobblenaut${suffix.slice(-4)}`; // appears ONLY in the body
const titleWord = `Zephyrix${suffix.slice(-4)}`; // appears ONLY in the title
let ctx: SessionUser;
let userId: string;
let categoryId: string;

beforeAll(async () => {
  const user = await db.user.create({
    data: { name: "Writer", email: `w-${suffix}@test.mv`, role: "ADMIN" },
  });
  userId = user.id;
  ctx = { id: user.id, role: "ADMIN", name: user.name, email: user.email };

  const category = await db.helpCategory.create({
    data: { slug: `cat-${suffix}`, title: `Category ${suffix}` },
  });
  categoryId = category.id;

  await db.helpArticle.create({
    data: {
      slug: `art-${suffix}`,
      title: `${titleWord} guide`,
      description: "A guide",
      categoryId,
      contentJson: {},
      contentHtml: `<p>The ${bodyWord} setting lives under advanced options.</p>`,
      status: "PUBLISHED",
      authorId: userId,
    },
  });
});

afterAll(async () => {
  await db.helpArticle.deleteMany({ where: { categoryId } });
  await db.helpCategory.deleteMany({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe("help centre article search", () => {
  it("finds an article by a word that only appears in its body", async () => {
    const rows = await listHelpArticles(ctx, { query: bodyWord });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain(titleWord);
  });

  it("finds an article by title", async () => {
    const rows = await listHelpArticles(ctx, { query: titleWord });
    expect(rows).toHaveLength(1);
  });

  it("is case-insensitive", async () => {
    const rows = await listHelpArticles(ctx, { query: bodyWord.toLowerCase() });
    expect(rows).toHaveLength(1);
  });

  it("returns nothing for a term in no article", async () => {
    expect(await listHelpArticles(ctx, { query: "zzz-nothing-zzz" })).toHaveLength(0);
  });

  it("combines with a status filter when one is given", async () => {
    expect(await listHelpArticles(ctx, { query: bodyWord, status: "PUBLISHED" })).toHaveLength(1);
    expect(await listHelpArticles(ctx, { query: bodyWord, status: "DRAFT" })).toHaveLength(0);
  });
});

describe("help articles in ⌘K", () => {
  it("surfaces an article by title, typed as ARTICLE", async () => {
    const hits = await quickSearch(ctx, titleWord);
    const article = hits.find((h) => h.type === "ARTICLE");
    expect(article).toBeDefined();
    expect(article?.href).toMatch(/^\/help-center\/.+/);
  });

  it("does not search article bodies from the palette", async () => {
    // Body matches belong on the Help Center page, where a result has room to
    // show why it matched.
    const hits = await quickSearch(ctx, bodyWord);
    expect(hits.some((h) => h.type === "ARTICLE")).toBe(false);
  });
});
