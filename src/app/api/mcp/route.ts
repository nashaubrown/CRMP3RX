import { authenticateRequest } from "@/services/api-keys";
import { executeMcpTool, listMcpTools } from "@/services/mcp";

// Remote MCP server (Model Context Protocol, Streamable HTTP transport,
// stateless). Lets Claude — claude.ai custom connectors, Claude Code,
// Claude Desktop — connect to the CRM and use its tools directly.
//
// Auth: a Perx API key, sent as "Authorization: Bearer perx_…" or, for
// clients that can't set headers, as "?key=perx_…" in the connector URL.
//
// Stateless by design: every JSON-RPC request is self-contained and answered
// with a single JSON response (the spec allows this in place of an SSE
// stream), so it needs no session store and deploys fine on serverless.

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(
  msg: JsonRpcRequest,
  userPromise: () => Promise<import("@/lib/authz").SessionUser | null>
) {
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "perx-crm", title: "Perx CRM", version: "1.0.0" },
        instructions:
          "CRM for Perx Technologies (merchant loyalty, Maldives). Use search_records first to resolve names to ids. All data is scoped to the connected user's permissions; log_activity and schedule_meeting require edit access to the record.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: listMcpTools() });
    case "tools/call": {
      const user = await userPromise();
      if (!user) return rpcError(id, -32603, "Invalid or revoked API key");
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const text = await executeMcpTool(user, name, args);
      let isError = false;
      try {
        isError = Boolean((JSON.parse(text) as { error?: unknown }).error);
      } catch {
        // non-JSON tool output is fine
      }
      return rpcResult(id, { content: [{ type: "text", text }], isError });
    }
    default:
      return rpcError(id, -32601, `Method not found: ${String(msg.method)}`);
  }
}

export async function POST(req: Request) {
  // Authenticate up front so misconfigured clients fail fast with a 401 —
  // but resolve the user lazily per tools/call to keep handshake cheap.
  const user = await authenticateRequest(req);
  if (!user) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message:
            "Unauthorized. Create an API key in Perx CRM Settings and send it as 'Authorization: Bearer perx_…' (or append ?key=perx_… to the URL).",
        },
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const messages = (Array.isArray(body) ? body : [body]) as JsonRpcRequest[];
  if (messages.length > 20) {
    return Response.json(rpcError(null, -32600, "Batch too large (max 20)"), { status: 400 });
  }
  const requests = messages.filter((m) => m.method && m.id !== undefined && m.id !== null);
  const notifications = messages.filter((m) => m.method && (m.id === undefined || m.id === null));

  // Notifications (e.g. notifications/initialized) need no reply.
  if (requests.length === 0 && notifications.length > 0) {
    return new Response(null, { status: 202 });
  }
  if (requests.length === 0) {
    return Response.json(rpcError(null, -32600, "Invalid request"), { status: 400 });
  }

  const results = await Promise.all(requests.map((m) => handleMessage(m, async () => user)));
  return Response.json(Array.isArray(body) && requests.length > 1 ? results : results[0]);
}

// The Streamable HTTP spec lets a stateless server decline the SSE stream.
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
