import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleMcpPost } from "@/app/api/mcp/handler";
import { db } from "@/lib/db";
import { createApiKey } from "@/services/api-keys";

// claude.ai custom connectors call the MCP endpoint WITHOUT the query string,
// so the "?key=perx_…" form arrives unauthenticated. The connector URL puts the
// key in the path instead (/api/mcp/<key>), which survives. These cover that
// path-key route and make sure the header form still works.

const suffix = `mcp-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;
let token: string;

const rpc = (method: string, id = 1) =>
  new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method }),
  });

beforeAll(async () => {
  const user = await db.user.create({
    data: { name: "MCP Tester", email: `mcp-${suffix}@test.mv`, role: "ADMIN" },
  });
  userId = user.id;
  ({ token } = await createApiKey(
    { id: user.id, role: "ADMIN", name: user.name, email: user.email },
    "mcp path test"
  ));
});

afterAll(async () => {
  await db.apiKey.deleteMany({ where: { userId } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe("MCP endpoint auth", () => {
  it("authenticates with the key taken from the URL path", async () => {
    const res = await handleMcpPost(rpc("initialize"), token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(body.result?.serverInfo?.name).toBe("perx-crm");
  });

  it("serves tools/list over a path key", async () => {
    const res = await handleMcpPost(rpc("tools/list", 2), token);
    const body = (await res.json()) as { result?: { tools?: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.result?.tools?.length).toBeGreaterThan(0);
  });

  it("401s on a bad path key", async () => {
    const res = await handleMcpPost(rpc("initialize"), "perx_bogus");
    expect(res.status).toBe(401);
  });

  it("401s when no key is supplied at all", async () => {
    const res = await handleMcpPost(rpc("initialize"));
    expect(res.status).toBe(401);
  });

  it("still accepts the Authorization header when no path key is given", async () => {
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect((await handleMcpPost(req)).status).toBe(200);
  });
});
