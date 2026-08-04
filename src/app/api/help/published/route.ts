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
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
