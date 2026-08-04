import { NextResponse } from "next/server";

import { getPublishedPayload } from "@/services/help-center";

// Public, unauthenticated: the payload is exactly the content already
// published on the public help site. Consumed by the help site's build
// (HELP_CONTENT_API) — and cacheable by anyone else who finds it.

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getPublishedPayload();
  return NextResponse.json(payload, {
    headers: {
      // no-store: the help site build must always see the latest published set;
      // CDN-cached payloads made rebuilds ship stale content.
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
