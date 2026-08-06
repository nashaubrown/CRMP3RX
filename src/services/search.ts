import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { merchantVisibleWhere } from "@/services/merchant-access";

// Backs the ⌘K palette: one query across the record types a rep jumps to,
// plus help articles. Merchant-derived results respect the caller's
// canSeeAllMerchants capability, so the palette can't surface a record the
// user couldn't open from the list.

export type QuickHitType = "MERCHANT" | "CONTACT" | "DEAL" | "LEAD" | "ARTICLE";

export type QuickHit = {
  id: string;
  type: QuickHitType;
  title: string;
  subtitle: string | null;
  href: string;
};

const PER_TYPE = 5;

export async function quickSearch(ctx: SessionUser, rawQuery: string): Promise<QuickHit[]> {
  const query = rawQuery.trim();
  // One character matches most of the database and helps nobody.
  if (query.length < 2) return [];

  const like = { contains: query, mode: "insensitive" as const };
  // A rep restricted to their own book must not reach a colleague's account
  // through search either — including via its contacts or deals.
  const visible = await merchantVisibleWhere(ctx);

  const [merchants, contacts, deals, leads, articles] = await Promise.all([
    db.merchant.findMany({
      // AND, not a spread: both sides carry an `OR`, and spreading would
      // silently drop the visibility filter.
      where: { AND: [visible, { OR: [{ name: like }, { email: like }, { phone: like }] }] },
      select: { id: true, name: true, status: true, category: true },
      take: PER_TYPE,
      orderBy: { updatedAt: "desc" },
    }),
    db.contact.findMany({
      where: {
        merchant: visible,
        OR: [{ firstName: like }, { lastName: like }, { email: like }, { phone: like }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        merchant: { select: { name: true } },
      },
      take: PER_TYPE,
      orderBy: { updatedAt: "desc" },
    }),
    db.deal.findMany({
      where: { merchant: visible, OR: [{ title: like }, { merchant: { name: like } }] },
      select: { id: true, title: true, stage: true, merchant: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { updatedAt: "desc" },
    }),
    db.lead.findMany({
      where: { OR: [{ name: like }, { company: like }, { email: like }] },
      select: { id: true, name: true, company: true, email: true, status: true },
      take: PER_TYPE,
      orderBy: { updatedAt: "desc" },
    }),
    // Help articles are matched on their metadata only — the body is searched
    // on the Help Center page itself, where results have room to be read.
    db.helpArticle.findMany({
      where: { OR: [{ title: like }, { description: like }, { slug: like }] },
      select: { id: true, title: true, status: true, category: { select: { title: true } } },
      take: PER_TYPE,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return [
    ...merchants.map((m): QuickHit => ({
      id: m.id,
      type: "MERCHANT",
      title: m.name,
      subtitle: [m.category, m.status.toLowerCase()].filter(Boolean).join(" · ") || null,
      href: `/merchants/${m.id}`,
    })),
    ...contacts.map((c): QuickHit => ({
      id: c.id,
      type: "CONTACT",
      title: `${c.firstName} ${c.lastName}`.trim(),
      subtitle: [c.title, c.merchant?.name].filter(Boolean).join(" · ") || null,
      href: `/contacts/${c.id}`,
    })),
    ...deals.map((d): QuickHit => ({
      id: d.id,
      type: "DEAL",
      title: d.title,
      subtitle: [d.merchant?.name, d.stage.toLowerCase()].filter(Boolean).join(" · ") || null,
      href: `/deals/${d.id}`,
    })),
    ...leads.map((l): QuickHit => ({
      id: l.id,
      type: "LEAD",
      // A captured lead may have no name yet — fall back to whatever
      // identifies it rather than showing an empty row.
      title: l.name || l.company || l.email || "Untitled lead",
      subtitle: [l.company, l.status.toLowerCase()].filter(Boolean).join(" · ") || null,
      href: `/leads/${l.id}`,
    })),
    ...articles.map((a): QuickHit => ({
      id: a.id,
      type: "ARTICLE",
      title: a.title,
      subtitle:
        [a.category?.title, a.status === "PUBLISHED" ? null : a.status.toLowerCase().replace("_", " ")]
          .filter(Boolean)
          .join(" · ") || null,
      href: `/help-center/${a.id}`,
    })),
  ];
}
