import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpenAiCompatibleProvider,
  accumulateToolCallDelta,
  finalizeToolCalls,
  toOpenAiMessages,
  toOpenAiTools,
  type ToolCallAccumulator,
} from "@/integrations/ai/openai-compatible";
import type { AiMessage, AiStreamEvent } from "@/integrations/ai/types";

describe("toOpenAiMessages", () => {
  it("converts the neutral thread into OpenAI chat format", () => {
    const thread: AiMessage[] = [
      { role: "user", content: "find island bakery" },
      {
        role: "assistant",
        content: "Looking it up.",
        toolCalls: [{ id: "call_1", name: "search_records", input: { query: "island" } }],
      },
      {
        role: "tool_results",
        results: [{ toolCallId: "call_1", name: "search_records", content: '{"merchants":[]}' }],
      },
      { role: "assistant", content: "No results." },
    ];

    const out = toOpenAiMessages("SYSTEM", thread);
    expect(out[0]).toEqual({ role: "system", content: "SYSTEM" });
    expect(out[1]).toEqual({ role: "user", content: "find island bakery" });
    expect(out[2]).toMatchObject({
      role: "assistant",
      content: "Looking it up.",
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "search_records", arguments: '{"query":"island"}' } },
      ],
    });
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"merchants":[]}' });
    expect(out[4]).toEqual({ role: "assistant", content: "No results." });
  });

  it("maps tool definitions to function declarations", () => {
    const tools = toOpenAiTools([
      { name: "t", description: "d", inputSchema: { type: "object", properties: {} } },
    ]);
    expect(tools[0]).toEqual({
      type: "function",
      function: { name: "t", description: "d", parameters: { type: "object", properties: {} } },
    });
  });
});

describe("tool-call fragment accumulation", () => {
  it("assembles arguments streamed in pieces across chunks", () => {
    const acc: ToolCallAccumulator = new Map();
    accumulateToolCallDelta(acc, [
      { index: 0, id: "call_9", function: { name: "search_records", arguments: '{"que' } },
    ]);
    accumulateToolCallDelta(acc, [{ index: 0, function: { arguments: 'ry":"bakery"}' } }]);

    expect(finalizeToolCalls(acc)).toEqual([
      { id: "call_9", name: "search_records", input: { query: "bakery" } },
    ]);
  });

  it("tolerates malformed argument JSON and drops nameless calls", () => {
    const acc: ToolCallAccumulator = new Map();
    accumulateToolCallDelta(acc, [
      { index: 0, id: "a", function: { name: "x", arguments: "{broken" } },
      { index: 1, id: "b", function: { arguments: "{}" } }, // never got a name
    ]);
    const calls = finalizeToolCalls(acc);
    expect(calls).toEqual([{ id: "a", name: "x", input: {} }]);
  });
});

describe("OpenAiCompatibleProvider.streamTurn", () => {
  afterEach(() => vi.unstubAllGlobals());

  function sseResponse(lines: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(new TextEncoder().encode(line + "\n"));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }

  async function collect(gen: AsyncGenerator<AiStreamEvent>) {
    const events: AiStreamEvent[] = [];
    for await (const e of gen) events.push(e);
    return events;
  }

  const provider = new OpenAiCompatibleProvider({
    baseUrl: "https://fake.example/v1",
    apiKey: "k",
    model: "test-model",
    providerName: "Fake",
  });

  it("streams text deltas and emits a final event with tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}',
        'data: {"choices":[{"delta":{"content":"lo"}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"search_records","arguments":"{\\"query\\":\\"x\\"}"}}]}}]}',
        "data: [DONE]",
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(
      provider.streamTurn({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [] })
    );

    expect(events.filter((e) => e.type === "delta").map((e) => e.text)).toEqual(["Hel", "lo"]);
    expect(events.at(-1)).toEqual({
      type: "final",
      text: "Hello",
      toolCalls: [{ id: "c1", name: "search_records", input: { query: "x" } }],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fake.example/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body).model).toBe("test-model");
  });

  it("throws a labeled error on non-200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":"rate limited"}', { status: 429 }))
    );
    await expect(
      collect(provider.streamTurn({ system: "s", messages: [], tools: [] }))
    ).rejects.toThrow(/Fake \(test-model\) error \(429\)/);
  });
});
