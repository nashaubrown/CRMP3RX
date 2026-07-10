import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  authenticateToken,
  createApiKey,
  hashToken,
  listApiKeys,
  revokeApiKey,
} from "@/services/api-keys";

// API keys authenticate REST and MCP requests as their owner. Only the
// SHA-256 hash is stored; revoked keys stop working immediately.

const suffix = `ktest-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;
const ctx = () => ({ id: userId, role: "SALES_REP" as const, name: "Key Tester" });

beforeAll(async () => {
  const user = await db.user.create({
    data: { name: "Key Tester", email: `keys-${suffix}@test.mv`, role: "SALES_REP" },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("api keys", () => {
  it("creates a key, stores only its hash, and authenticates the token", async () => {
    const { key, token } = await createApiKey(ctx(), "Test key");

    expect(token).toMatch(/^perx_[0-9a-f]{48}$/);
    expect(key.hashedKey).toBe(hashToken(token));
    expect(key.hashedKey).not.toContain(token.slice(5)); // no plaintext at rest
    expect(key.prefix).toBe(token.slice(0, 11));

    const who = await authenticateToken(token);
    expect(who?.id).toBe(userId);
    expect(who?.role).toBe("SALES_REP");
  });

  it("rejects unknown and malformed tokens", async () => {
    expect(await authenticateToken("perx_" + "0".repeat(48))).toBeNull();
    expect(await authenticateToken("not-a-perx-token")).toBeNull();
    expect(await authenticateToken("")).toBeNull();
  });

  it("revoked keys stop authenticating and leave the list", async () => {
    const { key, token } = await createApiKey(ctx(), "Short-lived");
    expect(await authenticateToken(token)).not.toBeNull();

    await revokeApiKey(ctx(), key.id);
    expect(await authenticateToken(token)).toBeNull();

    const remaining = await listApiKeys(ctx());
    expect(remaining.some((k) => k.id === key.id)).toBe(false);
  });

  it("users can only revoke their own keys", async () => {
    const other = await db.user.create({
      data: { name: "Other", email: `other-${suffix}@test.mv`, role: "SALES_REP" },
    });
    const { key } = await createApiKey(ctx(), "Mine");

    await expect(
      revokeApiKey({ id: other.id, role: "SALES_REP" }, key.id)
    ).rejects.toThrow(/not found/);
  });
});
