import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/rbac";
import { getDevTicketAttachment } from "@/services/dev-tickets";

export const dynamic = "force-dynamic";

// Ticket screenshots/files. Tickets are team-wide, so any signed-in user may
// view; the session cookie authenticates. Never cached.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { id } = await params;
  const file = await getDevTicketAttachment(id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.sizeBytes),
      "Cache-Control": "no-store, private",
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
}
