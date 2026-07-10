import type { Prisma } from "@prisma/client";

import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { merchantSchema } from "@/lib/validators/merchant";
import { contactSchema } from "@/lib/validators/contact";
import { audit } from "@/services/audit";
import { createContact } from "@/services/contacts";
import { merchantMineWhere, merchantSharedWhere } from "@/services/merchant-access";
import { createMerchant } from "@/services/merchants";

// CSV export/import. Exports honor the same scope/status/search filters as
// the list pages (all matching rows, not just one page). Imports run every
// row through the same zod validators and services as the web forms, so
// RBAC, edit-rights gates and audit logging apply unchanged.

const EXPORT_CAP = 5000;
export const IMPORT_ROW_CAP = 1000;

// ---------- Export ----------

type ExportFilters = { q?: string; status?: string; scope?: string };

export async function exportMerchantsCsv(ctx: SessionUser, f: ExportFilters) {
  const where: Prisma.MerchantWhereInput = {
    ...(f.scope === "mine"
      ? merchantMineWhere(ctx)
      : f.scope === "shared"
        ? merchantSharedWhere(ctx)
        : {}),
    ...(f.status && ["PROSPECT", "ACTIVE", "CHURNED"].includes(f.status)
      ? { status: f.status as "PROSPECT" | "ACTIVE" | "CHURNED" }
      : {}),
    ...(f.q
      ? {
          OR: [
            { name: { contains: f.q, mode: "insensitive" as const } },
            { category: { contains: f.q, mode: "insensitive" as const } },
            { email: { contains: f.q, mode: "insensitive" as const } },
            { address: { contains: f.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const rows = await db.merchant.findMany({
    where,
    orderBy: { name: "asc" },
    take: EXPORT_CAP,
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { contacts: true, deals: true } },
    },
  });
  return toCsv(rows, [
    { header: "name", value: (m) => m.name },
    { header: "category", value: (m) => m.category },
    { header: "status", value: (m) => m.status },
    { header: "email", value: (m) => m.email },
    { header: "phone", value: (m) => m.phone },
    { header: "website", value: (m) => m.website },
    { header: "address", value: (m) => m.address },
    { header: "posSystem", value: (m) => m.posSystem },
    { header: "monthlyTxnVolume", value: (m) => m.monthlyTxnVolume },
    { header: "loyaltyLive", value: (m) => m.loyaltyLive },
    { header: "notes", value: (m) => m.notes },
    { header: "ownerEmail", value: (m) => m.owner.email },
    { header: "ownerName", value: (m) => m.owner.name },
    { header: "contacts", value: (m) => m._count.contacts },
    { header: "deals", value: (m) => m._count.deals },
    { header: "id", value: (m) => m.id },
    { header: "createdAt", value: (m) => m.createdAt },
    { header: "updatedAt", value: (m) => m.updatedAt },
  ]);
}

export async function exportContactsCsv(ctx: SessionUser, f: ExportFilters & { merchantId?: string }) {
  const where: Prisma.ContactWhereInput = {
    ...(f.scope === "mine"
      ? { merchant: merchantMineWhere(ctx) }
      : f.scope === "shared"
        ? { merchant: merchantSharedWhere(ctx) }
        : {}),
    ...(f.merchantId ? { merchantId: f.merchantId } : {}),
    ...(f.q
      ? {
          OR: [
            { firstName: { contains: f.q, mode: "insensitive" as const } },
            { lastName: { contains: f.q, mode: "insensitive" as const } },
            { email: { contains: f.q, mode: "insensitive" as const } },
            { merchant: { name: { contains: f.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const rows = await db.contact.findMany({
    where,
    orderBy: [{ merchant: { name: "asc" } }, { firstName: "asc" }],
    take: EXPORT_CAP,
    include: { merchant: { select: { name: true } } },
  });
  return toCsv(rows, [
    { header: "firstName", value: (c) => c.firstName },
    { header: "lastName", value: (c) => c.lastName },
    { header: "title", value: (c) => c.title },
    { header: "email", value: (c) => c.email },
    { header: "phone", value: (c) => c.phone },
    { header: "isPrimary", value: (c) => c.isPrimary },
    { header: "merchant", value: (c) => c.merchant.name },
    { header: "merchantId", value: (c) => c.merchantId },
    { header: "id", value: (c) => c.id },
    { header: "createdAt", value: (c) => c.createdAt },
  ]);
}

export async function exportDealsCsv(ctx: SessionUser, f: { scope?: string; stage?: string }) {
  const where: Prisma.DealWhereInput = {
    ...(f.scope === "mine" ? { ownerId: ctx.id } : {}),
    ...(f.stage && ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"].includes(f.stage)
      ? { stage: f.stage as Prisma.DealWhereInput["stage"] }
      : {}),
  };
  const rows = await db.deal.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: EXPORT_CAP,
    include: {
      merchant: { select: { name: true } },
      owner: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
  });
  return toCsv(rows, [
    { header: "title", value: (d) => d.title },
    { header: "stage", value: (d) => d.stage },
    { header: "value", value: (d) => Number(d.value) },
    { header: "currency", value: (d) => d.currency },
    { header: "merchant", value: (d) => d.merchant.name },
    { header: "contact", value: (d) => (d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : "") },
    { header: "owner", value: (d) => d.owner.name },
    { header: "expectedCloseDate", value: (d) => d.expectedCloseDate },
    { header: "lostReason", value: (d) => d.lostReason },
    { header: "id", value: (d) => d.id },
    { header: "createdAt", value: (d) => d.createdAt },
    { header: "updatedAt", value: (d) => d.updatedAt },
  ]);
}

export async function exportLeadsCsv(ctx: SessionUser, f: { q?: string; status?: string; scope?: string }) {
  const where: Prisma.LeadWhereInput = {
    ...(f.scope === "mine" ? { ownerId: ctx.id } : f.scope === "unassigned" ? { ownerId: null } : {}),
    ...(f.status && ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"].includes(f.status)
      ? { status: f.status as Prisma.LeadWhereInput["status"] }
      : {}),
    ...(f.q
      ? {
          OR: [
            { name: { contains: f.q, mode: "insensitive" as const } },
            { company: { contains: f.q, mode: "insensitive" as const } },
            { email: { contains: f.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const rows = await db.lead.findMany({
    where,
    orderBy: { score: "desc" },
    take: EXPORT_CAP,
    include: {
      owner: { select: { name: true } },
      merchant: { select: { name: true } },
    },
  });
  return toCsv(rows, [
    { header: "name", value: (l) => l.name },
    { header: "company", value: (l) => l.company },
    { header: "email", value: (l) => l.email },
    { header: "phone", value: (l) => l.phone },
    { header: "source", value: (l) => l.source },
    { header: "status", value: (l) => l.status },
    { header: "score", value: (l) => l.score },
    { header: "message", value: (l) => l.message },
    { header: "owner", value: (l) => l.owner?.name },
    { header: "merchant", value: (l) => l.merchant?.name },
    { header: "id", value: (l) => l.id },
    { header: "createdAt", value: (l) => l.createdAt },
  ]);
}

// ---------- Import ----------

export type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[]; // row = 1-based CSV line incl. header
};

const truthy = (v: string | undefined) =>
  ["true", "yes", "1", "y", "on"].includes((v ?? "").toLowerCase());

// Columns: name (required), category, status, email, phone, website, address,
// notes, posSystem, monthlyTxnVolume, loyaltyLive, ownerEmail (admins only).
// Rows whose name matches an existing merchant are skipped, so re-importing
// an export is safe.
export async function importMerchantsCsv(
  ctx: SessionUser,
  records: Record<string, string>[]
): Promise<ImportResult> {
  if (records.length > IMPORT_ROW_CAP) {
    return { created: 0, skipped: 0, errors: [{ row: 0, message: `Too many rows (max ${IMPORT_ROW_CAP})` }] };
  }

  const result: ImportResult = { created: 0, skipped: 0, errors: [] };
  const admin = isAdmin(ctx);
  const ownerCache = new Map<string, string | null>();

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rowNo = i + 2; // header is line 1
    const lc = (k: string) => rec[k.toLowerCase()];

    try {
      const name = lc("name");
      if (!name) {
        result.errors.push({ row: rowNo, message: "Missing name" });
        continue;
      }
      const existing = await db.merchant.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      let ownerId: string | undefined;
      const ownerEmail = lc("owneremail");
      if (admin && ownerEmail) {
        if (!ownerCache.has(ownerEmail)) {
          const owner = await db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
          ownerCache.set(ownerEmail, owner?.id ?? null);
        }
        const cached = ownerCache.get(ownerEmail);
        if (!cached) {
          result.errors.push({ row: rowNo, message: `No user with email ${ownerEmail}` });
          continue;
        }
        ownerId = cached;
      }

      const status = (lc("status") ?? "PROSPECT").toUpperCase();
      const parsed = merchantSchema.safeParse({
        name,
        category: lc("category"),
        status: ["PROSPECT", "ACTIVE", "CHURNED"].includes(status) ? status : "PROSPECT",
        email: lc("email"),
        phone: lc("phone"),
        website: lc("website"),
        address: lc("address"),
        notes: lc("notes"),
        posSystem: lc("possystem"),
        monthlyTxnVolume: lc("monthlytxnvolume"),
        loyaltyLive: truthy(lc("loyaltylive")) ? true : undefined,
        ownerId,
      });
      if (!parsed.success) {
        result.errors.push({ row: rowNo, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }

      await createMerchant(ctx, parsed.data);
      result.created++;
    } catch (e) {
      result.errors.push({ row: rowNo, message: e instanceof Error ? e.message : "Failed" });
    }
  }

  await audit({
    actorId: ctx.id,
    action: "import.merchants",
    entityType: "IMPORT",
    entityId: "merchants",
    diff: { rows: records.length, ...result, errors: result.errors.slice(0, 20) },
  });
  return result;
}

// Columns: firstName, lastName (required), title, email, phone, isPrimary,
// and merchant (name) or merchantId. Needs edit rights on each merchant.
// Rows matching an existing contact (same email, or same name when the row
// has no email, under the same merchant) are skipped.
export async function importContactsCsv(
  ctx: SessionUser,
  records: Record<string, string>[]
): Promise<ImportResult> {
  if (records.length > IMPORT_ROW_CAP) {
    return { created: 0, skipped: 0, errors: [{ row: 0, message: `Too many rows (max ${IMPORT_ROW_CAP})` }] };
  }

  const result: ImportResult = { created: 0, skipped: 0, errors: [] };
  const merchantCache = new Map<string, string | null>();

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rowNo = i + 2;
    const lc = (k: string) => rec[k.toLowerCase()];

    try {
      // Resolve the merchant by id or (case-insensitive) name.
      let merchantId = lc("merchantid") || null;
      const merchantName = lc("merchant");
      if (!merchantId && merchantName) {
        const cacheKey = merchantName.toLowerCase();
        if (!merchantCache.has(cacheKey)) {
          const m = await db.merchant.findFirst({
            where: { name: { equals: merchantName, mode: "insensitive" } },
            select: { id: true },
          });
          merchantCache.set(cacheKey, m?.id ?? null);
        }
        merchantId = merchantCache.get(cacheKey) ?? null;
      }
      if (!merchantId) {
        result.errors.push({
          row: rowNo,
          message: merchantName ? `Merchant "${merchantName}" not found` : "Missing merchant or merchantId",
        });
        continue;
      }

      const firstName = lc("firstname");
      const lastName = lc("lastname");
      const email = lc("email");
      const dupe = await db.contact.findFirst({
        where: {
          merchantId,
          ...(email
            ? { email: { equals: email, mode: "insensitive" } }
            : {
                firstName: { equals: firstName ?? "", mode: "insensitive" },
                lastName: { equals: lastName ?? "", mode: "insensitive" },
              }),
        },
        select: { id: true },
      });
      if (dupe) {
        result.skipped++;
        continue;
      }

      const parsed = contactSchema.safeParse({
        firstName,
        lastName,
        title: lc("title"),
        email,
        phone: lc("phone"),
        merchantId,
        isPrimary: truthy(lc("isprimary")) ? true : undefined,
      });
      if (!parsed.success) {
        result.errors.push({ row: rowNo, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }

      await createContact(ctx, parsed.data);
      result.created++;
    } catch (e) {
      result.errors.push({ row: rowNo, message: e instanceof Error ? e.message : "Failed" });
    }
  }

  await audit({
    actorId: ctx.id,
    action: "import.contacts",
    entityType: "IMPORT",
    entityId: "contacts",
    diff: { rows: records.length, ...result, errors: result.errors.slice(0, 20) },
  });
  return result;
}
