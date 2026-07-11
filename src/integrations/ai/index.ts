import { AnthropicProvider } from "@/integrations/ai/anthropic";
import { OpenAiCompatibleProvider } from "@/integrations/ai/openai-compatible";
import type { AiProvider } from "@/integrations/ai/types";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export type { AiMessage, AiProvider, AiStreamEvent, AiToolCall, AiToolDef } from "@/integrations/ai/types";

// Provider selection for Ask Perx and the Generative canvas.
//
// Resolution order:
//   1. Settings (DB, set by an admin in the UI) — authoritative if present.
//   2. Environment variables (.env) — the fallback / default.
//
//   AI_PROVIDER = ANTHROPIC | GROQ | GEMINI | OPENROUTER | MISTRAL | OLLAMA
//               | OPENAI | CUSTOM
//
// Every non-Anthropic option speaks the OpenAI-compatible API. Presets fill
// in the base URL, a default model and which env var holds the key.
//
// Privacy note (in .env.example / the Settings card): free tiers of hosted
// providers may use your prompts — i.e. CRM data — for training. Anthropic and
// self-hosted Ollama do not.

export type Preset = {
  name: string;
  baseUrl: string;
  defaultModel: string;
  keyEnv?: string; // provider-specific key env var (AI_API_KEY always wins)
  keyOptional?: boolean;
  custom?: boolean; // requires a base URL to be supplied
  // Curated known-good model IDs for the Settings dropdown. Empty = free-text
  // (e.g. Ollama, where models depend on what the user has pulled).
  models?: string[];
};

export const PRESETS: Record<string, Preset> = {
  ANTHROPIC: {
    name: "Anthropic",
    baseUrl: "",
    defaultModel: "claude-opus-4-8",
    keyEnv: "ANTHROPIC_API_KEY",
    models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  GROQ: {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyEnv: "GROQ_API_KEY",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"],
  },
  GEMINI: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    keyEnv: "GEMINI_API_KEY",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  OPENROUTER: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    keyEnv: "OPENROUTER_API_KEY",
    models: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "mistralai/mistral-7b-instruct:free",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
  MISTRAL: {
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    keyEnv: "MISTRAL_API_KEY",
    models: ["mistral-small-latest", "mistral-large-latest"],
  },
  OLLAMA: {
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    keyOptional: true,
    // Free-text: models depend on what you've `ollama pull`ed
    models: [],
  },
  OPENAI: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyEnv: "OPENAI_API_KEY",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  },
  CUSTOM: {
    name: "Custom",
    baseUrl: "",
    defaultModel: "",
    keyOptional: true,
    custom: true,
    models: [],
  },
};

// A fully-resolved provider configuration and where it came from.
export type ResolvedAiConfig = {
  provider: string; // key into PRESETS
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  source: "settings" | "env";
};

function envConfig(): ResolvedAiConfig | null {
  const choice = (process.env.AI_PROVIDER ?? "").trim().toUpperCase() || "ANTHROPIC";
  const preset = PRESETS[choice];
  if (!preset) return null;
  const apiKey =
    process.env.AI_API_KEY || (preset.keyEnv ? process.env[preset.keyEnv] : undefined);
  return {
    provider: choice,
    apiKey,
    model: process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || undefined,
    baseUrl: process.env.AI_BASE_URL || undefined,
    source: "env",
  };
}

async function settingsConfig(): Promise<ResolvedAiConfig | null> {
  try {
    const row = await db.aiSetting.findUnique({ where: { id: "singleton" } });
    if (!row || !PRESETS[row.provider]) return null;
    return {
      provider: row.provider,
      apiKey: row.apiKeyEnc ? (decryptSecret(row.apiKeyEnc) ?? undefined) : undefined,
      model: row.model ?? undefined,
      baseUrl: row.baseUrl ?? undefined,
      source: "settings",
    };
  } catch {
    // e.g. table not migrated yet — fall back to env
    return null;
  }
}

// Resolves the active configuration: Settings first, then env.
export async function resolveAiConfig(): Promise<ResolvedAiConfig | null> {
  return (await settingsConfig()) ?? envConfig();
}

// Builds a provider from a resolved config, or null if it's incomplete.
export function buildProvider(config: ResolvedAiConfig | null): AiProvider | null {
  if (!config) return null;
  const preset = PRESETS[config.provider];
  if (!preset) return null;

  if (config.provider === "ANTHROPIC") {
    // The SDK reads ANTHROPIC_API_KEY from env; a Settings key overrides it.
    if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) return null;
    return new AnthropicProvider(config.model || preset.defaultModel, config.apiKey);
  }

  // Named providers ALWAYS use their canonical API URL — only CUSTOM takes a
  // supplied base URL. This ignores any stale/incorrect stored or env base URL
  // (e.g. someone pasting the provider's website into the field).
  const baseUrl = preset.custom ? config.baseUrl : preset.baseUrl;
  const model = config.model || preset.defaultModel;
  if (!baseUrl || !model) return null;
  if (!config.apiKey && !preset.keyOptional) return null;

  return new OpenAiCompatibleProvider({
    baseUrl,
    apiKey: config.apiKey,
    model,
    providerName: preset.name,
  });
}

export async function getAiProvider(): Promise<AiProvider | null> {
  return buildProvider(await resolveAiConfig());
}

export async function aiConfigured(): Promise<boolean> {
  return (await getAiProvider()) !== null;
}

export async function aiConfigHint(): Promise<string> {
  const config = await resolveAiConfig();
  if (config && !buildProvider(config)) {
    const where = config.source === "settings" ? "Settings" : ".env";
    return `The ${PRESETS[config.provider]?.name ?? config.provider} provider is selected in ${where} but its API key is missing — add it in Settings → AI provider.`;
  }
  return "An admin can set it up in Settings → AI provider (Anthropic, or a free provider like Groq/Gemini/Ollama), or via ANTHROPIC_API_KEY / AI_PROVIDER in .env.";
}
