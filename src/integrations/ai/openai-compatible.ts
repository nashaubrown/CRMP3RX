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
    const res = await fetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `${this.label} error (${res.status}): ${body.slice(0, 300) || res.statusText}`
      );
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
