import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { audit } from "@/services/audit";

// Personal access tokens for the REST API (/api/v1/*) and the MCP endpoint
// (/api/mcp). A key authenticates as the user who created it, so every
// request goes through the same services layer and RBAC scoping as the web
// app. Only a SHA-256 hash is stored — the full token is shown once.

const TOKEN_PREFIX = "perx_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

export async function createApiKey(ctx: SessionUser, name: string) {
  const token = generateToken();
  const key = await db.apiKey.create({
    data: {
      name,
      prefix: token.slice(0, TOKEN_PREFIX.length + 6),
      hashedKey: hashToken(token),
      userId: ctx.id,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "api_key.create",
    entityType: "API_KEY",
    entityId: key.id,
    diff: { name, prefix: key.prefix },
  });

  // The plaintext token exists only in this return value.
  return { key, token };
}

export async function listApiKeys(ctx: SessionUser) {
  return db.apiKey.findMany({
    where: { userId: ctx.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  });
}

export async function revokeApiKey(ctx: SessionUser, id: string) {
  const key = await db.apiKey.findFirst({ where: { id, userId: ctx.id, revokedAt: null } });
  if (!key) throw new Error("API key not found");

  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });

  await audit({
    actorId: ctx.id,
    action: "api_key.revoke",
    entityType: "API_KEY",
    entityId: id,
    diff: { name: key.name, prefix: key.prefix },
  });
}

// Resolve a bearer token to its owner. Returns null for unknown, malformed
// or revoked tokens.
export async function authenticateToken(token: string): Promise<SessionUser | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const hashed = hashToken(token);
  const key = await db.apiKey.findUnique({
    where: { hashedKey: hashed },
    include: { user: { select: { id: true, role: true, name: true, email: true } } },
  });
  if (!key || key.revokedAt) return null;

  // Constant-time compare on top of the unique lookup (defense in depth).
  const a = Buffer.from(hashed);
  const b = Buffer.from(key.hashedKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Best-effort usage stamp; never block the request on it.
  db.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return key.user;
}

// Extract the token from a request: "Authorization: Bearer perx_...",
// an "x-api-key" header, or a "key" query parameter (for MCP clients that
// can't set custom headers).
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const headerKey = req.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  const url = new URL(req.url);
  return url.searchParams.get("key");
}

export async function authenticateRequest(req: Request): Promise<SessionUser | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  return authenticateToken(token);
}
