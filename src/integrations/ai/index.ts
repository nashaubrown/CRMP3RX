import { AnthropicProvider } from "@/integrations/ai/anthropic";
import { OpenAiCompatibleProvider } from "@/integrations/ai/openai-compatible";
import type { AiProvider } from "@/integrations/ai/types";

export type { AiMessage, AiProvider, AiStreamEvent, AiToolCall, AiToolDef } from "@/integrations/ai/types";

// Provider selection for Ask Perx, mirroring the email/SMS provider pattern.
//
//   AI_PROVIDER = ANTHROPIC | GROQ | GEMINI | OPENROUTER | MISTRAL | OLLAMA
//               | OPENAI | CUSTOM
//
// Every non-Anthropic option speaks the OpenAI-compatible API. Presets fill
// in the base URL, a sensible default model and which env var holds the key;
// AI_MODEL / AI_BASE_URL / AI_API_KEY override any preset. When AI_PROVIDER
// is unset, Anthropic is used if ANTHROPIC_API_KEY is set.
//
// Privacy note (documented in .env.example): free tiers of hosted providers
// may use your prompts — i.e. CRM data — for training. Anthropic API and
// self-hosted Ollama do not.

type Preset = {
  name: string;
  baseUrl: string;
  defaultModel: string;
  keyEnv?: string; // provider-specific key env var (AI_API_KEY always wins)
  keyOptional?: boolean;
};

const PRESETS: Record<string, Preset> = {
  GROQ: {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyEnv: "GROQ_API_KEY",
  },
  GEMINI: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    keyEnv: "GEMINI_API_KEY",
  },
  OPENROUTER: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    keyEnv: "OPENROUTER_API_KEY",
  },
  MISTRAL: {
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    keyEnv: "MISTRAL_API_KEY",
  },
  OLLAMA: {
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    keyOptional: true,
  },
  OPENAI: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyEnv: "OPENAI_API_KEY",
  },
  CUSTOM: {
    name: "Custom",
    baseUrl: "", // must come from AI_BASE_URL
    defaultModel: "",
    keyOptional: true,
  },
};

function resolveKey(preset: Preset): string | undefined {
  return process.env.AI_API_KEY || (preset.keyEnv ? process.env[preset.keyEnv] : undefined);
}

// Returns the configured provider, or null with no valid configuration.
export function getAiProvider(): AiProvider | null {
  const choice = (process.env.AI_PROVIDER ?? "").trim().toUpperCase();

  if (choice === "" || choice === "ANTHROPIC") {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    return new AnthropicProvider(process.env.ANTHROPIC_MODEL || "claude-opus-4-8");
  }

  const preset = PRESETS[choice];
  if (!preset) return null;

  const baseUrl = process.env.AI_BASE_URL || preset.baseUrl;
  const model = process.env.AI_MODEL || preset.defaultModel;
  const apiKey = resolveKey(preset);
  if (!baseUrl || !model) return null;
  if (!apiKey && !preset.keyOptional) return null;

  return new OpenAiCompatibleProvider({ baseUrl, apiKey, model, providerName: preset.name });
}

export function aiConfigured(): boolean {
  return getAiProvider() !== null;
}

export function aiConfigHint(): string {
  const choice = (process.env.AI_PROVIDER ?? "").trim().toUpperCase();
  if (choice && choice !== "ANTHROPIC" && PRESETS[choice] && !resolveKey(PRESETS[choice])) {
    return `AI_PROVIDER is ${choice} but no API key was found — set ${PRESETS[choice].keyEnv ?? "AI_API_KEY"} in .env and restart.`;
  }
  return "Set ANTHROPIC_API_KEY in .env — or use a free provider by setting AI_PROVIDER (GROQ, GEMINI, OPENROUTER, MISTRAL, OLLAMA) with its API key. See .env.example.";
}
