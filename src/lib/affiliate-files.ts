import type { AffiliateFileKind } from "@prisma/client";

import { db } from "@/lib/db";

// Private storage for affiliate registration uploads (ID documents, drawn
// signatures). Files live in Postgres rather than public blob storage so they
// are genuinely private: the only read path is the ADMIN-authenticated route
// at /api/affiliate-files/[id]. Volume is tiny (a few files per application,
// ≤10 MB each). This module is the single seam — swap the implementation for
// external blob storage without touching callers.

export const ID_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

export const ID_DOCUMENT_CONTENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

// Content sniffing: trust the bytes, not the client's declared MIME type.
export function sniffContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  ) {
    return "application/pdf";
  }
  return null;
}

export async function saveAffiliateFile(args: {
  affiliateId: string;
  kind: AffiliateFileKind;
  contentType: string;
  data: Uint8Array;
  tcVersion?: string | null;
}): Promise<string> {
  const row = await db.affiliateFile.create({
    data: {
      affiliateId: args.affiliateId,
      kind: args.kind,
      contentType: args.contentType,
      sizeBytes: args.data.byteLength,
      data: Buffer.from(args.data),
      tcVersion: args.tcVersion ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

// Retention purges (rejected applications, abandoned drafts) delete every
// file an affiliate uploaded.
export async function deleteAffiliateFiles(affiliateId: string): Promise<number> {
  const res = await db.affiliateFile.deleteMany({ where: { affiliateId } });
  return res.count;
}
