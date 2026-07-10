import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { aiConfigHint, getAiProvider } from "@/integrations/ai";
import type { AiMessage, AiToolDef } from "@/integrations/ai";
import { describeAnthropicError } from "@/integrations/ai/anthropic";
import {
  canvasActionSchema,
  viewSpecSchema,
  type CanvasAction,
  type ViewSpec,
} from "@/lib/validators/canvas";
import { createActivity } from "@/services/activities";
import { assistantToolDefinitions, executeAssistantTool } from "@/services/assistant-tools";
import { toggleActivityComplete } from "@/services/activities";
import { audit } from "@/services/audit";

const MAX_TOOL_ITERATIONS = 8;

// Terminal tool: the model calls this once it has gathered data, passing the
// view to render. The schema is intentionally loose (the real contract is
// enforced by viewSpecSchema server-side); the vocabulary lives in the prompt.
const renderViewTool: AiToolDef = {
  name: "render_view",
  description:
    "Render the final UI for the user. Call this exactly once, at the end, after you have gathered the data you need with the other tools. Pass the composed view.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short heading for the view" },
      summary: { type: "string", description: "Optional one-line summary under the title" },
      blocks: {
        type: "array",
        description:
          "Ordered UI blocks. Each block is an object with a 'type' field; see the system instructions for the allowed block shapes.",
        items: { type: "object" },
      },
    },
    required: ["title", "blocks"],
  },
};

const readTools: AiToolDef[] = assistantToolDefinitions.map((t) => ({
  name: t.name,
  description: t.description ?? "",
  inputSchema: t.input_schema as Record<string, unknown>,
}));

function systemPrompt(ctx: SessionUser): string {
  return `You are the Generative UI engine for Perx Technologies' internal CRM (a B2B2C merchant-loyalty SaaS in the Maldives). Instead of writing prose, you COMPOSE A UI: gather data with the read tools, then call render_view exactly once with a set of blocks.

You are serving ${ctx.name ?? "a user"} (role: ${ctx.role === "ADMIN" ? "admin" : "sales rep"}). Every tool runs as this user with their permissions.

WORKFLOW
1. Use search_records first when the user names a merchant or person, then fetch details by id. Use list_deals, pipeline_summary, list_activities_due, recent_communications, stale_merchants as needed.
2. Then call render_view once. Do not call it before you have the data. Never invent ids, names, numbers or dates — use only what tools returned.

BLOCK TYPES (each block is {"type": "...", ...}):
- {"type":"text","body":"markdown-free prose"} — a short narrative/answer.
- {"type":"stat_group","stats":[{"label":"Open deals","value":"12","sublabel":"optional","tone":"positive|warning|danger|info|default"}]} — KPI tiles (max 6).
- {"type":"bar_chart","title":"Pipeline (USD)","bars":[{"label":"NEW","value":3000,"display":"USD 3,000"}]} — value drives bar length; display is the printed label.
- {"type":"table","columns":[{"key":"name","label":"Name"}],"rows":[{"name":"Island Bakery"}],"caption":"optional"} — rows are objects keyed by column key.
- {"type":"list","items":[{"title":"...","subtitle":"...","badge":"ACTIVE","tone":"info","href":"/merchants/ID"}]} — hrefs must be internal app paths.
- {"type":"record_card","kind":"merchant|contact|deal|lead","name":"...","subtitle":"...","href":"/merchants/ID","fields":[{"label":"Status","value":"Active"}],"actions":[...]} — a highlighted record.
- {"type":"actions","title":"optional","actions":[...]} — a row of buttons.

ACTIONS (used in record_card.actions and the actions block):
- {"kind":"link","label":"Open merchant","href":"/merchants/ID"} — navigate. Real screens: /merchants/ID, /contacts/ID, /deals/ID, /leads/ID, /merchants, /deals, /tasks. To email or schedule, LINK to the record (its page has those buttons).
- {"kind":"log_activity","label":"Log call","entityType":"MERCHANT|CONTACT|DEAL","entityId":"ID","activityType":"NOTE|CALL|TASK|MEETING","subject":"...","body":"optional"} — one-click logs an activity on the timeline (only works if the user can edit that record).
- {"kind":"complete_task","label":"Mark done","activityId":"ID"} — one-click completes a task/meeting the user owns.
Only offer log_activity / complete_task when the user's intent is clearly to act; otherwise prefer link. Never fabricate an entityId — it must come from a tool result.

STYLE: Lead with the most useful block. Prefer stat_group + a table/list for overviews; record_card for a single entity. Keep it compact. Amounts: keep MVR and USD separate, never convert. Dates are Maldives time (UTC+5). Today is ${new Date().toLocaleDateString("en-GB", { timeZone: "Indian/Maldives", day: "numeric", month: "long", year: "numeric" })}.`;
}

export type CanvasEvent =
  | { type: "tool"; name: string }
  | { type: "view"; id: string; view: ViewSpec }
  | { type: "error"; message: string };

// Runs the compose loop: read tools gather data, render_view returns the spec.
export async function* generateCanvasView(
  ctx: SessionUser,
  prompt: string
): AsyncGenerator<CanvasEvent> {
  const provider = await getAiProvider();
  if (!provider) {
    yield { type: "error", message: `Generative UI isn't configured yet. ${await aiConfigHint()}` };
    return;
  }

  const messages: AiMessage[] = [{ role: "user", content: prompt }];
  const tools = [...readTools, renderViewTool];

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
      let turnText = "";

      for await (const event of provider.streamTurn({
        system: systemPrompt(ctx),
        messages,
        tools,
      })) {
        if (event.type === "final") {
          turnText = event.text;
          toolCalls = event.toolCalls;
        }
      }

      const renderCall = toolCalls.find((c) => c.name === "render_view");
      if (renderCall) {
        const parsed = viewSpecSchema.safeParse(renderCall.input);
        if (parsed.success) {
          const saved = await persistView(ctx, prompt, parsed.data);
          yield { type: "view", id: saved.id, view: parsed.data };
          return;
        }
        // Feed the validation error back so the model can correct itself.
        messages.push({ role: "assistant", content: turnText, toolCalls });
        messages.push({
          role: "tool_results",
          results: [
            {
              toolCallId: renderCall.id,
              name: "render_view",
              content: `Invalid view: ${parsed.error.issues
                .slice(0, 5)
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")}. Fix and call render_view again.`,
            },
          ],
        });
        continue;
      }

      if (toolCalls.length === 0) {
        // Model answered in prose instead of rendering — wrap it as a view.
        const body = turnText.trim() || "No result.";
        const view: ViewSpec = { title: "Result", blocks: [{ type: "text", body }] };
        const saved = await persistView(ctx, prompt, view);
        yield { type: "view", id: saved.id, view };
        return;
      }

      // Execute read-tool calls and loop.
      messages.push({ role: "assistant", content: turnText, toolCalls });
      const results = [];
      for (const call of toolCalls) {
        yield { type: "tool", name: call.name };
        const content = await executeAssistantTool(ctx, call.name, call.input);
        results.push({ toolCallId: call.id, name: call.name, content });
      }
      messages.push({ role: "tool_results", results });
    }

    yield { type: "error", message: "Couldn't compose a view — try rephrasing your request." };
  } catch (e) {
    const message =
      describeAnthropicError(e) ?? (e instanceof Error ? e.message : "Something went wrong");
    yield { type: "error", message };
  }
}

async function persistView(ctx: SessionUser, prompt: string, view: ViewSpec) {
  return db.canvasView.create({
    data: {
      userId: ctx.id,
      prompt,
      title: view.title.slice(0, 120),
      spec: JSON.parse(JSON.stringify(view)),
    },
  });
}

export async function listCanvasViews(ctx: SessionUser) {
  return db.canvasView.findMany({
    where: { userId: ctx.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, prompt: true, createdAt: true },
  });
}

export async function getCanvasView(ctx: SessionUser, id: string) {
  const row = await db.canvasView.findFirst({ where: { id, userId: ctx.id } });
  if (!row) return null;
  const parsed = viewSpecSchema.safeParse(row.spec);
  return parsed.success ? { id: row.id, prompt: row.prompt, view: parsed.data } : null;
}

// Executes an inline action from a generated view. Write actions re-validate
// through the same services (and RBAC/edit-rights gates) as the rest of the
// app — the model can only propose; the server enforces.
export async function runCanvasAction(
  ctx: SessionUser,
  rawAction: unknown
): Promise<{ ok: boolean; message: string }> {
  const parsed = canvasActionSchema.safeParse(rawAction);
  if (!parsed.success) return { ok: false, message: "Invalid action" };
  const action: CanvasAction = parsed.data;

  if (action.kind === "link") {
    return { ok: true, message: "" }; // navigation handled client-side
  }

  await audit({
    actorId: ctx.id,
    action: "canvas.action",
    entityType: "ASSISTANT",
    entityId: action.kind,
    diff: { action },
  });

  if (action.kind === "log_activity") {
    await createActivity(ctx, {
      type: action.activityType,
      subject: action.subject,
      body: action.body,
      entityType: action.entityType,
      entityId: action.entityId,
    });
    return { ok: true, message: `Logged “${action.subject}”` };
  }

  // complete_task
  await toggleActivityComplete(ctx, action.activityId);
  return { ok: true, message: "Task updated" };
}
