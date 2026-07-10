import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import {
  assistantToolDefinitions,
  executeAssistantTool,
} from "@/services/assistant-tools";

const MAX_TOOL_ITERATIONS = 8;
const HISTORY_LIMIT = 20;

export function assistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
}

function systemPrompt(ctx: SessionUser): string {
  return `You are "Ask Perx", the AI assistant inside Perx Technologies' internal CRM. Perx is a B2B2C merchant-loyalty SaaS in the Maldives; its sales team uses this CRM to manage merchants, contacts, leads, deals, tasks and communications.

You are talking to ${ctx.name ?? "a user"} (role: ${ctx.role === "ADMIN" ? "admin" : "sales rep"}). All data access runs as this user with their permissions.

Rules:
- You are READ-ONLY. You cannot create, edit, delete or send anything. When a question implies an action (send an email, create a task, move a deal, share a merchant), draft what you'd suggest and point the user to the right screen (e.g. the merchant page's Email button, the Deals board, the record's activity form) — never claim you performed an action.
- Ground every answer in tool results. If the data isn't there, say so plainly rather than guessing. Never invent merchants, numbers or dates.
- Use search_records first when the user names a merchant or person; then fetch details by id.
- Amounts: keep MVR and USD separate; never convert between them.
- Dates and times are Maldives time (UTC+5).
- Be concise and answer directly. Use short bullet lists for multiple records. Plain text only — no markdown tables or headers.
- Today's date is ${new Date().toLocaleDateString("en-GB", { timeZone: "Indian/Maldives", day: "numeric", month: "long", year: "numeric" })}.`;
}

export type AssistantEvent =
  | { type: "conversation"; id: string }
  | { type: "delta"; text: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

// Runs one user turn: persists messages, streams the reply, executes
// read-only tools in a manual loop, and records tool calls on the message.
export async function* runAssistantTurn(
  ctx: SessionUser,
  conversationId: string | null,
  userMessage: string
): AsyncGenerator<AssistantEvent> {
  if (!assistantConfigured()) {
    yield {
      type: "error",
      message: "Ask Perx isn't configured yet — set ANTHROPIC_API_KEY in .env and restart.",
    };
    return;
  }

  // Load or create the conversation (scoped to the user).
  let conversation =
    conversationId !== null
      ? await db.conversation.findFirst({ where: { id: conversationId, userId: ctx.id } })
      : null;
  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        userId: ctx.id,
        title: userMessage.length > 60 ? `${userMessage.slice(0, 57)}…` : userMessage,
      },
    });
  }
  yield { type: "conversation", id: conversation.id };

  const history = await db.chatMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
  });

  await db.chatMessage.create({
    data: { conversationId: conversation.id, role: "USER", content: userMessage },
  });

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const toolCallLog: { tool: string; input: unknown }[] = [];
  let fullText = "";

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const stream = client.messages.stream({
        model: getModel(),
        max_tokens: 8192,
        system: systemPrompt(ctx),
        tools: assistantToolDefinitions,
        messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullText += event.delta.text;
          yield { type: "delta", text: event.delta.text };
        }
      }

      const message = await stream.finalMessage();

      if (message.stop_reason !== "tool_use") break;

      const toolUses = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      messages.push({ role: "assistant", content: message.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        yield { type: "tool", name: toolUse.name };
        toolCallLog.push({ tool: toolUse.name, input: toolUse.input });
        const result = await executeAssistantTool(
          ctx,
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      }
      messages.push({ role: "user", content: results });
    }

    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: fullText || "(no response)",
        toolCalls: toolCallLog.length > 0 ? JSON.parse(JSON.stringify(toolCallLog)) : undefined,
      },
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    yield { type: "done" };
  } catch (e) {
    const message =
      e instanceof Anthropic.APIError
        ? `Claude API error (${e.status}): ${e.message}`
        : e instanceof Error
          ? e.message
          : "Something went wrong";
    yield { type: "error", message };
  }
}

export async function listConversations(ctx: SessionUser) {
  return db.conversation.findMany({
    where: { userId: ctx.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}

export async function getConversationMessages(ctx: SessionUser, conversationId: string) {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId: ctx.id },
  });
  if (!conversation) return null;
  const messages = await db.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  return { conversation, messages };
}
