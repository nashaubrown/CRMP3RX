import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/rbac";
import { getAffiliateFileForAdmin } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Private affiliate uploads (ID documents, signatures), served to CRM admins
// only — the applications review drawer points its <img>/<iframe> here. The
// session cookie authenticates; the service enforces the ADMIN role. Never
// cached anywhere.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionUser();
  if (!ctx || ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only" }, { status: ctx ? 403 : 401 });
  }

  const { id } = await params;
  const file = await getAffiliateFileForAdmin(ctx, id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.sizeBytes),
      "Cache-Control": "no-store, private",
      "Content-Disposition": "inline",
    },
  });
}
