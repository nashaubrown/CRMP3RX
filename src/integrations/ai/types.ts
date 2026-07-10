// Provider-neutral chat types for the AI assistant. The agent loop (history,
// tool execution, persistence) lives in services/assistant.ts; a provider
// only streams a single model turn.

export type AiToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
};

export type AiToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AiMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AiToolCall[] }
  | { role: "tool_results"; results: { toolCallId: string; name: string; content: string }[] };

export type AiStreamEvent =
  | { type: "delta"; text: string }
  // Terminal event of every turn: full text + any tool calls the model made.
  | { type: "final"; text: string; toolCalls: AiToolCall[] };

export interface AiProvider {
  // e.g. "Groq (llama-3.3-70b-versatile)" — shown in errors/UI
  label: string;
  streamTurn(params: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDef[];
  }): AsyncGenerator<AiStreamEvent>;
}
