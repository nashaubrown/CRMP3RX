import { handleMcpPost, methodNotAllowed } from "@/app/api/mcp/handler";

// MCP endpoint with the API key as a path segment: /api/mcp/perx_…
//
// This is the connector URL to give claude.ai: its custom connectors call the
// server without the query string, so the "?key=" form arrives unauthenticated
// and 401s — which pushes the client into an OAuth flow that can't succeed.

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return handleMcpPost(req, key);
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
