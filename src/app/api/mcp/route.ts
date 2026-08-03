import { handleMcpPost, methodNotAllowed } from "@/app/api/mcp/handler";

// MCP endpoint, key supplied by header or ?key=. See handler.ts.
// Clients that drop the query string should use /api/mcp/<key> instead.

export function POST(req: Request) {
  return handleMcpPost(req);
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
