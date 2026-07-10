import { z } from "zod";

import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import {
  PRESETS,
  buildProvider,
  resolveAiConfig,
  type ResolvedAiConfig,
} from "@/integrations/ai";
import { audit } from "@/services/audit";

// Admin-managed AI provider configuration (Ask Perx + Generative canvas).
// The API key is encrypted at rest and never returned to the client.

export const AI_PROVIDER_OPTIONS = Object.entries(PRESETS).map(([value, p]) => ({
  value,
  name: p.name,
  defaultModel: p.defaultModel,
  keyOptional: Boolean(p.keyOptional),
  custom: Boolean(p.custom),
}));

export const saveAiSettingsSchema = z.object({
  provider: z.enum([
    "ANTHROPIC",
    "GROQ",
    "GEMINI",
    "OPENROUTER",
    "MISTRAL",
    "OLLAMA",
    "OPENAI",
    "CUSTOM",
  ]),
  // Blank means "keep the existing key" (never clears it by accident).
  apiKey: z.string().trim().max(400).optional(),
  model: z.string().trim().max(120).optional(),
  baseUrl: z.string().trim().max(300).optional(),
});

export type SaveAiSettingsInput = z.infer<typeof saveAiSettingsSchema>;

export type AiSettingsView = {
  isAdmin: boolean;
  // The active config (what the assistant will actually use)
  activeProviderLabel: string | null;
  activeSource: "settings" | "env" | null;
  configured: boolean;
  // The stored Settings row (for the form), never including the key itself
  saved: {
    provider: string;
    model: string | null;
    baseUrl: string | null;
    hasKey: boolean;
  } | null;
};

export async function getAiSettings(ctx: SessionUser): Promise<AiSettingsView> {
  if (!isAdmin(ctx)) {
    return {
      isAdmin: false,
      activeProviderLabel: null,
      activeSource: null,
      configured: false,
      saved: null,
    };
  }

  const [row, active] = await Promise.all([
    db.aiSetting.findUnique({ where: { id: "singleton" } }),
    resolveAiConfig(),
  ]);

  return {
    isAdmin: true,
    activeProviderLabel: active ? (PRESETS[active.provider]?.name ?? active.provider) : null,
    activeSource: active?.source ?? null,
    configured: buildProvider(active) !== null,
    saved: row
      ? {
          provider: row.provider,
          model: row.model,
          baseUrl: row.baseUrl,
          hasKey: Boolean(row.apiKeyEnc),
        }
      : null,
  };
}

export async function saveAiSettings(ctx: SessionUser, input: SaveAiSettingsInput) {
  if (!isAdmin(ctx)) throw new Error("Only admins can configure the AI provider");
  const preset = PRESETS[input.provider];
  if (!preset) throw new Error("Unknown provider");

  const existing = await db.aiSetting.findUnique({ where: { id: "singleton" } });
  const key = input.apiKey?.trim();

  // Validate that we'll end up with a usable config.
  const willHaveKey = Boolean(key) || Boolean(existing?.apiKeyEnc && existing.provider === input.provider);
  if (!preset.keyOptional && !willHaveKey) {
    throw new Error(`${preset.name} needs an API key`);
  }
  if (preset.custom && !input.baseUrl?.trim() && !existing?.baseUrl) {
    throw new Error("A base URL is required for a custom provider");
  }

  // Keep the existing key when the field is left blank AND the provider is
  // unchanged; a provider switch drops a stale key unless a new one is given.
  const apiKeyEnc = key
    ? encryptSecret(key)
    : existing?.provider === input.provider
      ? existing.apiKeyEnc
      : null;

  await db.aiSetting.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      provider: input.provider,
      model: input.model || null,
      baseUrl: input.baseUrl || null,
      apiKeyEnc,
      updatedById: ctx.id,
    },
    update: {
      provider: input.provider,
      model: input.model || null,
      baseUrl: input.baseUrl || null,
      apiKeyEnc,
      updatedById: ctx.id,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "ai_settings.save",
    entityType: "AI_SETTINGS",
    entityId: "singleton",
    // Never log the key
    diff: { provider: input.provider, model: input.model || null, keyUpdated: Boolean(key) },
  });
}

export async function clearAiSettings(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new Error("Only admins can configure the AI provider");
  await db.aiSetting.deleteMany({ where: { id: "singleton" } });
  await audit({
    actorId: ctx.id,
    action: "ai_settings.clear",
    entityType: "AI_SETTINGS",
    entityId: "singleton",
  });
}

// Live check: runs a trivial completion against the active provider so an
// admin can confirm the key works before relying on it.
export async function testAiConnection(
  ctx: SessionUser
): Promise<{ ok: boolean; message: string }> {
  if (!isAdmin(ctx)) return { ok: false, message: "Admins only" };

  const config: ResolvedAiConfig | null = await resolveAiConfig();
  const provider = buildProvider(config);
  if (!provider) return { ok: false, message: "No provider configured yet" };

  try {
    let text = "";
    for await (const event of provider.streamTurn({
      system: "You are a connection test. Reply with the single word: OK.",
      messages: [{ role: "user", content: "ping" }],
      tools: [],
    })) {
      if (event.type === "final") text = event.text;
    }
    return {
      ok: true,
      message: `Connected to ${provider.label}${text ? ` — replied “${text.trim().slice(0, 40)}”` : ""}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Connection failed" };
  }
}
