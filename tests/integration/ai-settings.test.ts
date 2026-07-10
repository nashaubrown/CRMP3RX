import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { getAiProvider, resolveAiConfig } from "@/integrations/ai";
import {
  clearAiSettings,
  getAiSettings,
  saveAiSettings,
} from "@/services/ai-settings";

// AI provider settings: admin-gated, encrypted at rest, never leaks the key,
// and overrides the .env config when present.

const suffix = `ais-${Math.random().toString(36).slice(2, 8)}`;
let adminId: string;
let repId: string;
const admin = () => ({ id: adminId, role: "ADMIN" as const, name: "Admin" });
const rep = () => ({ id: repId, role: "SALES_REP" as const, name: "Rep" });

beforeAll(async () => {
  const [a, r] = await Promise.all([
    db.user.create({ data: { name: "Admin", email: `admin-${suffix}@test.mv`, role: "ADMIN" } }),
    db.user.create({ data: { name: "Rep", email: `rep-${suffix}@test.mv`, role: "SALES_REP" } }),
  ]);
  adminId = a.id;
  repId = r.id;
});

afterEach(async () => {
  await db.aiSetting.deleteMany({ where: { id: "singleton" } });
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: { in: [adminId, repId] } } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("ai settings", () => {
  it("saves a provider + key, stores it encrypted, and never returns it", async () => {
    await saveAiSettings(admin(), { provider: "GROQ", apiKey: "gsk_secret_value_123", model: "" });

    const row = await db.aiSetting.findUnique({ where: { id: "singleton" } });
    expect(row?.provider).toBe("GROQ");
    // stored ciphertext, not the raw key
    expect(row?.apiKeyEnc).toBeTruthy();
    expect(row?.apiKeyEnc).not.toContain("gsk_secret_value_123");

    const view = await getAiSettings(admin());
    expect(view.saved?.hasKey).toBe(true);
    // The masked view has no field that could carry the key
    expect(JSON.stringify(view)).not.toContain("gsk_secret_value_123");
  });

  it("resolves the settings config and decrypts the key for provider use", async () => {
    await saveAiSettings(admin(), { provider: "GROQ", apiKey: "gsk_decrypt_me_456" });
    const config = await resolveAiConfig();
    expect(config?.source).toBe("settings");
    expect(config?.provider).toBe("GROQ");
    expect(config?.apiKey).toBe("gsk_decrypt_me_456");
    expect(await getAiProvider()).not.toBeNull();
  });

  it("keeps the existing key when the field is left blank on the same provider", async () => {
    await saveAiSettings(admin(), { provider: "GROQ", apiKey: "gsk_keep_me_789" });
    await saveAiSettings(admin(), { provider: "GROQ", apiKey: "", model: "llama-3.1-8b-instant" });
    const config = await resolveAiConfig();
    expect(config?.apiKey).toBe("gsk_keep_me_789");
    expect(config?.model).toBe("llama-3.1-8b-instant");
  });

  it("rejects a key-required provider with no key", async () => {
    await expect(saveAiSettings(admin(), { provider: "GROQ", apiKey: "" })).rejects.toThrow(
      /API key/i
    );
  });

  it("allows a keyless provider (Ollama)", async () => {
    await saveAiSettings(admin(), { provider: "OLLAMA", apiKey: "" });
    const config = await resolveAiConfig();
    expect(config?.provider).toBe("OLLAMA");
    expect(await getAiProvider()).not.toBeNull(); // key-optional
  });

  it("forbids non-admins from reading or writing", async () => {
    const view = await getAiSettings(rep());
    expect(view.isAdmin).toBe(false);
    expect(view.saved).toBeNull();
    await expect(saveAiSettings(rep(), { provider: "GROQ", apiKey: "x" })).rejects.toThrow(
      /admin/i
    );
    await expect(clearAiSettings(rep())).rejects.toThrow(/admin/i);
  });

  it("clear reverts to the env-derived config", async () => {
    await saveAiSettings(admin(), { provider: "GROQ", apiKey: "gsk_temp" });
    expect((await resolveAiConfig())?.source).toBe("settings");
    await clearAiSettings(admin());
    const after = await resolveAiConfig();
    // env has no AI config in the test runner -> null, or source env if set
    expect(after?.source ?? "env").not.toBe("settings");
  });
});
