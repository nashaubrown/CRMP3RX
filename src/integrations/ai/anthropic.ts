import Anthropic from "@anthropic-ai/sdk";

import type { AiMessage, AiProvider, AiStreamEvent, AiToolDef } from "@/integrations/ai/types";

function toAnthropicMessages(messages: AiMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === "tool_results") {
      return {
        role: "user",
        content: m.results.map(
          (r): Anthropic.ToolResultBlockParam => ({
            type: "tool_result",
            tool_use_id: r.toolCallId,
            content: r.content,
          })
        ),
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const call of m.toolCalls) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      return { role: "assistant", content: blocks };
    }
    return { role: m.role, content: m.content };
  });
}

export class AnthropicProvider implements AiProvider {
  readonly label: string;
  private model: string;
  private apiKey?: string;

  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.apiKey = apiKey;
    this.label = `Anthropic (${model})`;
  }

  async *streamTurn(params: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDef[];
  }): AsyncGenerator<AiStreamEvent> {
    const client = new Anthropic(this.apiKey ? { apiKey: this.apiKey } : undefined);
    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 8192,
      system: params.system,
      tools: params.tools.map(
        (t): Anthropic.Tool => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })
      ),
      messages: toAnthropicMessages(params.messages),
    });

    let text = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        yield { type: "delta", text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();
    yield {
      type: "final",
      text,
      toolCalls: message.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> })),
    };
  }
}

// Formats Anthropic API errors nicely; null for anything else.
export function describeAnthropicError(e: unknown): string | null {
  return e instanceof Anthropic.APIError ? `Claude API error (${e.status}): ${e.message}` : null;
}
