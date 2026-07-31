import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { aiConfigHint, aiConfigured, getAiProvider } from "@/integrations/ai";
import type { AiMessage, AiToolDef } from "@/integrations/ai";
import { describeAnthropicError } from "@/integrations/ai/anthropic";
import {
  assistantToolDefinitions,
  executeAssistantTool,
} from "@/services/assistant-tools";

const MAX_TOOL_ITERATIONS = 8;
const HISTORY_LIMIT = 20;

export function assistantConfigured(): Promise<boolean> {
  return aiConfigured();
}

const assistantTools: AiToolDef[] = assistantToolDefinitions.map((t) => ({
  name: t.name,
  description: t.description ?? "",
  inputSchema: t.input_schema as Record<string, unknown>,
}));

function systemPrompt(ctx: SessionUser): string {
  return `You are "Ask Perx", the AI assistant inside Perx Technologies' internal CRM. Perx is a B2B2C merchant-loyalty SaaS in the Maldives; its sales team uses this CRM to manage merchants, contacts, leads, deals, tasks and communications.

You are talking to ${ctx.name ?? "a user"} (role: ${ctx.role === "ADMIN" ? "admin" : "sales rep"}). All data access runs as this user with their permissions.

Rules:
- You are READ-ONLY. You cannot create, edit, delete or send anything. When a question implies an action (send an email, create a task, move a deal, share a merchant), draft what you'd suggest and point the user to the right screen (e.g. the merchant page's Email button, the Deals board, the record's activity form) — never claim you performed an action.
- Ground every answer in tool results. If the data isn't there, say so plainly rather than guessing. Never invent merchants, numbers or dates.
- Use search_records first when the user names a merchant or person; then fetch details by id.
- Vocabulary — do not mix these up:
  - MERCHANT statuses are prospect, active, churned. To count or list merchants (including "how many prospects does <person> own"), use list_merchants (with owner_name for a specific person). Never pass a merchant status to list_deals.
  - DEAL stages are new, qualified, proposal, negotiation, won, lost. Use list_deals / pipeline_summary for these. Never pass a deal stage to list_merchants.
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
  const provider = await getAiProvider();
  if (!provider) {
    yield { type: "error", message: `Ask Perx isn't configured yet. ${await aiConfigHint()}` };
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

  const messages: AiMessage[] = [
    ...history.map(
      (m): AiMessage => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      })
    ),
    { role: "user", content: userMessage },
  ];

  const toolCallLog: { tool: string; input: unknown }[] = [];
  let fullText = "";

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let turnText = "";
      let toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

      for await (const event of provider.streamTurn({
        system: systemPrompt(ctx),
        messages,
        tools: assistantTools,
      })) {
        if (event.type === "delta") {
          fullText += event.text;
          yield { type: "delta", text: event.text };
        } else {
          turnText = event.text;
          toolCalls = event.toolCalls;
        }
      }

      if (toolCalls.length === 0) break;

      messages.push({ role: "assistant", content: turnText, toolCalls });

      const results: { toolCallId: string; name: string; content: string }[] = [];
      for (const call of toolCalls) {
        yield { type: "tool", name: call.name };
        toolCallLog.push({ tool: call.name, input: call.input });
        const result = await executeAssistantTool(ctx, call.name, call.input);
        results.push({ toolCallId: call.id, name: call.name, content: result });
      }
      messages.push({ role: "tool_results", results });
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
      describeAnthropicError(e) ?? (e instanceof Error ? e.message : "Something went wrong");
    yield { type: "error", message };
  }
}

// One-shot Q&A: runs the read-only tool loop and returns the final answer text,
// without streaming or persisting a conversation. Used by the Telegram bot.
export async function answerAssistantQuestion(
  ctx: SessionUser,
  question: string
): Promise<string> {
  const provider = await getAiProvider();
  if (!provider) {
    return `Ask Perx isn't configured yet. ${await aiConfigHint()}`;
  }

  const messages: AiMessage[] = [{ role: "user", content: question }];
  let answer = "";

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let turnText = "";
      let toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
      for await (const event of provider.streamTurn({
        system: systemPrompt(ctx),
        messages,
        tools: assistantTools,
      })) {
        if (event.type === "final") {
          turnText = event.text;
          toolCalls = event.toolCalls;
        }
      }
      if (turnText) answer = turnText;
      if (toolCalls.length === 0) break;

      messages.push({ role: "assistant", content: turnText, toolCalls });
      const results: { toolCallId: string; name: string; content: string }[] = [];
      for (const call of toolCalls) {
        results.push({
          toolCallId: call.id,
          name: call.name,
          content: await executeAssistantTool(ctx, call.name, call.input),
        });
      }
      messages.push({ role: "tool_results", results });
    }
  } catch (e) {
    // Never throw to the caller (e.g. the Telegram bot) — a model/tool error
    // becomes a friendly answer instead of silence.
    const detail = describeAnthropicError(e) ?? (e instanceof Error ? e.message : "");
    return answer.trim()
      ? answer.trim()
      : `I couldn't answer that — the AI model had trouble (${detail || "try rephrasing, or it may be rate-limited"}).`;
  }

  return answer.trim() || "I couldn't find an answer to that.";
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
