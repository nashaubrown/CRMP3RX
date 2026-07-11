import type { AiMessage, AiProvider, AiStreamEvent, AiToolDef } from "@/integrations/ai/types";

// Speaks the OpenAI Chat Completions API (streaming, with tools), which is
// the lingua franca of free/self-hosted providers: Groq, Google Gemini's
// OpenAI endpoint, OpenRouter, Mistral, Ollama, LM Studio, OpenAI itself.
// Implemented over fetch — no SDK dependency.

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export function toOpenAiMessages(system: string, messages: AiMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "tool_results") {
      for (const r of m.results) {
        out.push({ role: "tool", tool_call_id: r.toolCallId, content: r.content });
      }
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: "user", content: m.content });
    }
  }
  return out;
}

export function toOpenAiTools(tools: AiToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

// Accumulates streamed tool-call fragments (OpenAI chunks arguments as
// partial JSON strings keyed by index).
export type ToolCallAccumulator = Map<number, { id: string; name: string; args: string }>;

export function accumulateToolCallDelta(
  acc: ToolCallAccumulator,
  deltas: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[]
) {
  for (const d of deltas) {
    const index = d.index ?? 0;
    const entry = acc.get(index) ?? { id: "", name: "", args: "" };
    if (d.id) entry.id = d.id;
    if (d.function?.name) entry.name = d.function.name;
    if (d.function?.arguments) entry.args += d.function.arguments;
    acc.set(index, entry);
  }
}

export function finalizeToolCalls(acc: ToolCallAccumulator) {
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, c]) => {
      let input: Record<string, unknown> = {};
      try {
        input = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {};
      } catch {
        // leave {} — the tool will report invalid input
      }
      return { id: c.id || `call_${index}`, name: c.name, input };
    })
    .filter((c) => c.name);
}

// Turns an error response into one short, actionable line. Providers return
// wildly different bodies — a JSON {error:{message}}, a bare string, or (for
// OpenRouter/Vercel-hosted APIs) a full HTML 404 page — so never surface the
// raw body; extract the useful part and add a hint for the status code.
export function summarizeHttpError(
  label: string,
  status: number,
  statusText: string,
  body: string
): string {
  let detail = "";
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as { error?: { message?: string } | string; message?: string };
      const msg =
        typeof json.error === "string" ? json.error : json.error?.message || json.message;
      if (msg) detail = String(msg).slice(0, 200);
    } catch {
      /* fall through */
    }
  } else if (trimmed && !trimmed.startsWith("<")) {
    // Plain-text body (not HTML)
    detail = trimmed.slice(0, 200);
  }

  const hint =
    status === 401 || status === 403
      ? "Check the API key (and that it has access)."
      : status === 404
        ? "The model ID is wrong, deprecated, or your key can't access it — check the exact model name on the provider's models page (and that the key is valid). On OpenRouter, free (:free) models also require enabling free-model access at openrouter.ai/settings/privacy."
        : status === 429
          ? "Rate limited — wait a moment and retry (free tiers have low limits)."
          : status >= 500
            ? "The provider had a server error — try again shortly."
            : "";

  return [
    `${label} error (${status}${statusText ? ` ${statusText}` : ""})`,
    detail && `: ${detail}`,
    hint && ` — ${hint}`,
  ]
    .filter(Boolean)
    .join("");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// How long to wait before retrying a rate-limited/overloaded request:
// honor the Retry-After header (seconds or HTTP-date) when present, else an
// exponential backoff. Returns null when the provider says to wait too long
// to be worth blocking the request on.
export function retryDelayMs(retryAfter: string | null, attempt: number, capMs: number): number | null {
  let ms: number | null = null;
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) ms = secs * 1000;
    else {
      const when = Date.parse(retryAfter);
      if (!Number.isNaN(when)) ms = when - Date.now();
    }
  }
  if (ms === null) ms = 1000 * 2 ** attempt; // 1s, 2s, 4s…
  ms = Math.max(0, ms);
  return ms <= capMs ? ms : null;
}

const MAX_RETRIES = 2;
const RETRY_CAP_MS = 12_000;

export class OpenAiCompatibleProvider implements AiProvider {
  readonly label: string;

  constructor(
    private opts: { baseUrl: string; apiKey?: string; model: string; providerName: string }
  ) {
    this.label = `${opts.providerName} (${opts.model})`;
  }

  async *streamTurn(params: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDef[];
  }): AsyncGenerator<AiStreamEvent> {
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.opts.model,
        stream: true,
        messages: toOpenAiMessages(params.system, params.messages),
        ...(params.tools.length ? { tools: toOpenAiTools(params.tools) } : {}),
      }),
    };

    // Retry rate-limits (429) and transient overload (503) a couple of times,
    // honoring Retry-After, so free-tier bumps self-heal instead of erroring.
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(url, init);
      if (res.ok && res.body) break;

      const body = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status === 503;
      const wait = retryable
        ? retryDelayMs(res.headers.get("retry-after"), attempt, RETRY_CAP_MS)
        : null;
      if (retryable && attempt < MAX_RETRIES && wait !== null) {
        await sleep(wait);
        continue;
      }
      throw new Error(summarizeHttpError(this.label, res.status, res.statusText, body));
    }

    let text = "";
    const toolCalls: ToolCallAccumulator = new Map();
    let buffer = "";
    const decoder = new TextDecoder();

    // SSE: lines of "data: {json}", terminated by "data: [DONE]".
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;

        let json: {
          choices?: {
            delta?: {
              content?: string | null;
              tool_calls?: Parameters<typeof accumulateToolCallDelta>[1];
            };
          }[];
          error?: { message?: string };
        };
        try {
          json = JSON.parse(data);
        } catch {
          continue; // partial/keep-alive line
        }
        if (json.error?.message) throw new Error(`${this.label}: ${json.error.message}`);

        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          text += delta.content;
          yield { type: "delta", text: delta.content };
        }
        if (delta?.tool_calls) accumulateToolCallDelta(toolCalls, delta.tool_calls);
      }
    }

    yield { type: "final", text, toolCalls: finalizeToolCalls(toolCalls) };
  }
}
