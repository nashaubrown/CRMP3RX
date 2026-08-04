import { getAiProvider } from "@/integrations/ai";
import {
  answerCallbackQuery,
  editMessageText,
  getMe,
  sendMessage,
  setMyCommands,
} from "@/integrations/telegram/client";
import type { BotIdentity } from "@/integrations/telegram/client";
import type { SessionUser } from "@/lib/authz";
import { formatDateTime, parseMvLocal } from "@/lib/datetime";
import { db } from "@/lib/db";
import { escapeHtml as escape } from "@/lib/html";
import { contactSchema, type ContactInput } from "@/lib/validators/contact";
import { dealSchema, type DealInput } from "@/lib/validators/deal";
import { merchantSchema, type MerchantInput } from "@/lib/validators/merchant";
import { taskSchema, type TaskInput } from "@/lib/validators/task";
import { createActivity, listActivitiesForEntity } from "@/services/activities";
import { answerAssistantQuestion } from "@/services/assistant";
import { createContact } from "@/services/contacts";
import { createDeal, moveDealStage } from "@/services/deals";
import { createMerchant } from "@/services/merchants";
import { createSharedMeeting, getTelegramMeetingHost } from "@/services/scheduling";
import { createTask, moveTask, setTaskAssignee, setTaskDue } from "@/services/tasks";

// ---- Telegram update shapes (only the fields we use) ----
type TgUser = { id?: number; first_name?: string; username?: string; is_bot?: boolean };
type TgMessage = {
  message_id: number;
  chat: { id: number; type?: string };
  from?: TgUser;
  text?: string;
  reply_to_message?: { message_id: number; from?: TgUser };
};
type TgCallbackQuery = {
  id: string;
  data?: string;
  from?: TgUser;
  message?: { chat: { id: number } };
};
export type TelegramUpdate = {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

const ACTION_HINT =
  /\b(meeting|meet|meet-up|meetup|call|visit|demo|appointment|schedule|scheduled|catch\s?up|sync|session|add|new|create|onboard|register|sign\s?up|merchant|contact|client|lead)\b/i;

// Shown when the bot is addressed but can't tell what's being asked.
const NUDGE =
  "🤔 I didn't catch that. Ask me a question ending in “?”, or use a command — /help lists them.";

const CB_MEETING = "tgm"; // meeting confirmations
const CB_ACTION = "tga"; // merchant/contact/deal/task confirmations

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

// The bot's command menu (the "Menu" button). Registered via
// registerTelegramCommands() from /api/telegram/set-webhook.
export const COMMAND_MENU: { command: string; description: string }[] = [
  { command: "new_merchant", description: "Add a merchant" },
  { command: "new_contact", description: "Add a contact (to a merchant)" },
  { command: "new_deal", description: "Add a deal" },
  { command: "new_task", description: "Add a task" },
  { command: "schedule", description: "Schedule a meeting with a merchant" },
  { command: "merchants", description: "List merchants (optionally by status)" },
  { command: "deals", description: "List deals (optionally by stage)" },
  { command: "tasks", description: "List open tasks" },
  { command: "mine", description: "My tasks and meetings (needs /link)" },
  { command: "find", description: "Search merchants and contacts" },
  { command: "merchant", description: "Show a merchant's card" },
  { command: "ask", description: "Ask a question about the CRM data" },
  { command: "log", description: "Reply to a record to log a note" },
  { command: "move", description: "Reply to a deal to move its stage" },
  { command: "won", description: "Reply to a deal to mark it won" },
  { command: "lost", description: "Reply to a deal to mark it lost" },
  { command: "done", description: "Reply to a task to complete it" },
  { command: "assign", description: "Reply to a task: /assign <name>" },
  { command: "due", description: "Reply to a task: /due YYYY-MM-DD" },
  { command: "use", description: "Set the default merchant for this chat" },
  { command: "current", description: "Show the current default merchant" },
  { command: "link", description: "Link your Telegram to a CRM user: /link you@perx.mv" },
  { command: "cancel", description: "Cancel the current command" },
  { command: "help", description: "What can this bot do?" },
];

export async function registerTelegramCommands() {
  await setMyCommands(COMMAND_MENU);
}

// ---- AI extraction (free-text capture) ----

type Extracted =
  | { intent: "meeting"; merchantName: string; startLocal: string; durationMins: number; title: string }
  | { intent: "merchant"; name: string; category?: string | null; phone?: string | null; email?: string | null; address?: string | null }
  | { intent: "contact"; firstName: string; lastName: string; merchantName: string; title?: string | null; phone?: string | null; email?: string | null }
  | { intent: "none" };

async function runCompletion(system: string, user: string): Promise<string | null> {
  const provider = await getAiProvider();
  if (!provider) return null;
  let text = "";
  for await (const ev of provider.streamTurn({ system, messages: [{ role: "user", content: user }], tools: [] })) {
    if (ev.type === "final") text = ev.text;
  }
  return text.trim();
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function extractIntent(text: string): Promise<Extracted | null> {
  const today = formatDateTime(new Date(), "EEEE, d MMMM yyyy");
  const system =
    `You read ONE internal-sales-team chat message and decide whether it asks to: schedule a meeting, add a merchant, or add a contact — then extract the fields. ` +
    `Today is ${today} (Maldives time, UTC+5). ` +
    `Respond with ONLY minified JSON, no prose or code fences. Return exactly one of:\n` +
    `{"intent":"meeting","merchantName":string,"startLocal":"YYYY-MM-DDTHH:mm","durationMins":number,"title":string}\n` +
    `{"intent":"merchant","name":string,"category":string|null,"phone":string|null,"email":string|null,"address":string|null}\n` +
    `{"intent":"contact","firstName":string,"lastName":string,"merchantName":string,"title":string|null,"phone":string|null,"email":string|null}\n` +
    `{"intent":"none"}\n` +
    `Rules: startLocal is Maldives local 24-hour time; resolve relative dates against today. Meeting durationMins defaults to 30. ` +
    `If the message is chit-chat or none of these, return {"intent":"none"}.`;
  const parsed = parseJson<Extracted>(await runCompletion(system, text));
  if (!parsed || !parsed.intent) return null;
  return parsed;
}

// ---- Merchant matching ----

type MerchantMatch =
  | { status: "one"; merchant: { id: string; name: string } }
  | { status: "none" }
  | { status: "ambiguous"; candidates: { id: string; name: string }[] };

export async function matchMerchant(name: string): Promise<MerchantMatch> {
  const matches = await db.merchant.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 6,
  });
  if (matches.length === 0) return { status: "none" };
  if (matches.length === 1) return { status: "one", merchant: matches[0] };
  const exact = matches.filter((m) => m.name.toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return { status: "one", merchant: exact[0] };
  return { status: "ambiguous", candidates: matches };
}

function personName(from?: TgUser): string | null {
  if (!from) return null;
  return from.first_name ?? from.username ?? null;
}

// Bot-created records are owned by a shared "Sales" system account.
export async function getBotOwner(): Promise<SessionUser> {
  let user = await db.user.findFirst({
    where: { name: { equals: "Sales", mode: "insensitive" } },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    user = await db.user.create({
      data: { name: "Sales", email: "sales@perx.local", role: "ADMIN" },
      select: { id: true, name: true, email: true, role: true },
    });
  }
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

function confirmButtons(prefix: string, id: string) {
  return [
    [
      { text: "✅ Create", callback_data: `${prefix}:confirm:${id}` },
      { text: "❌ Cancel", callback_data: `${prefix}:cancel:${id}` },
    ],
  ];
}

type ActionKind = "MERCHANT" | "CONTACT" | "DEAL" | "TASK";

// Stores a pending create and posts a Confirm/Cancel card.
async function proposeAction(
  chatId: number,
  kind: ActionKind,
  payload: unknown,
  summary: string,
  by: string | null
) {
  const pending = await db.telegramPendingAction.create({
    data: {
      chatId: String(chatId),
      kind,
      payload: JSON.parse(JSON.stringify(payload)),
      summary,
      createdByName: by,
    },
  });
  const sent = await sendMessage(chatId, summary, confirmButtons(CB_ACTION, pending.id));
  await db.telegramPendingAction.update({
    where: { id: pending.id },
    data: { confirmationMessageId: String(sent.message_id) },
  });
}

// ---- Default merchant (/use) ----

async function getChatDefault(chatId: string) {
  return db.telegramChatDefault.findUnique({ where: { chatId } });
}

// ---- Lists, search, detail (Part B) ----

// Sends a message and remembers which record it shows, so a reply can act on it.
async function sendRecord(chatId: number, text: string, entityType: string, entityId: string) {
  const sent = await sendMessage(chatId, text);
  await db.telegramMessageRef.create({
    data: { chatId: String(chatId), messageId: String(sent.message_id), entityType, entityId },
  });
  return sent;
}

const DEAL_STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

async function cmdMerchants(chatId: number, args: string) {
  const status = args.trim().toUpperCase();
  const where = ["PROSPECT", "ACTIVE", "CHURNED"].includes(status)
    ? { status: status as "PROSPECT" | "ACTIVE" | "CHURNED" }
    : {};
  const merchants = await db.merchant.findMany({
    where,
    select: { name: true, status: true, owner: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 20,
  });
  if (merchants.length === 0) {
    await sendMessage(chatId, "No merchants found.");
    return;
  }
  const lines = merchants.map(
    (m) => `• <b>${escape(m.name)}</b> — ${m.status.toLowerCase()} — ${escape(m.owner?.name ?? "—")}`
  );
  await sendMessage(chatId, `🏪 Merchants (${merchants.length}${merchants.length === 20 ? "+" : ""}):\n${lines.join("\n")}`);
}

async function cmdDeals(chatId: number, args: string) {
  const stage = args.trim().toUpperCase();
  const where = (DEAL_STAGES as readonly string[]).includes(stage)
    ? { stage: stage as (typeof DEAL_STAGES)[number] }
    : {};
  const deals = await db.deal.findMany({
    where,
    include: { merchant: { select: { name: true } }, owner: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  if (deals.length === 0) {
    await sendMessage(chatId, "No deals found.");
    return;
  }
  await sendMessage(chatId, `💼 Deals (${deals.length}) — reply to one with /move, /won, /lost or /log:`);
  for (const d of deals) {
    await sendRecord(
      chatId,
      `<b>${escape(d.title)}</b>\n${escape(d.merchant.name)} · ${d.stage.toLowerCase()} · ${d.currency} ${Number(d.value).toLocaleString("en-US")} · ${escape(d.owner.name ?? "—")}`,
      "DEAL",
      d.id
    );
  }
}

async function cmdTasks(chatId: number, args: string) {
  const done = args.trim().toLowerCase() === "done";
  const tasks = await db.task.findMany({
    where: done ? { status: "DONE" } : { status: { not: "DONE" } },
    include: { assignee: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  if (tasks.length === 0) {
    await sendMessage(chatId, done ? "No completed tasks." : "No open tasks. 🎉");
    return;
  }
  await sendMessage(chatId, `✅ Tasks (${tasks.length}) — reply to one with /done, /assign, /due or /log:`);
  for (const t of tasks) {
    const due = t.dueAt ? ` · due ${formatDateTime(t.dueAt, "d MMM")}` : "";
    await sendRecord(
      chatId,
      `<b>${escape(t.title)}</b>\n${t.status.toLowerCase()} · ${t.priority.toLowerCase()} · ${escape(t.assignee.name ?? "—")}${due}`,
      "TASK",
      t.id
    );
  }
}

async function cmdMine(chatId: number, userId: string) {
  const link = await db.telegramUserLink.findUnique({ where: { telegramUserId: userId } });
  if (!link) {
    await sendMessage(chatId, "🔗 Link your CRM account first: <code>/link you@perx.mv</code>");
    return;
  }
  const now = new Date();
  const [tasks, meetings] = await Promise.all([
    db.task.findMany({
      where: { assigneeId: link.crmUserId, status: { not: "DONE" } },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    db.meeting.findMany({
      where: { hostUserId: link.crmUserId, status: "CONFIRMED", endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);
  const taskLines = tasks.length
    ? tasks.map((t) => `• ${escape(t.title)}${t.dueAt ? ` (due ${formatDateTime(t.dueAt, "d MMM")})` : ""}`).join("\n")
    : "None 🎉";
  const meetLines = meetings.length
    ? meetings.map((m) => `• ${escape(m.bookerName)} — ${formatDateTime(m.startAt)}`).join("\n")
    : "None";
  await sendMessage(chatId, `<b>Your open tasks</b>\n${taskLines}\n\n<b>Your upcoming meetings</b>\n${meetLines}`);
}

async function cmdFind(chatId: number, args: string) {
  if (!args.trim()) {
    await sendMessage(chatId, "Usage: /find <name>");
    return;
  }
  const [merchants, contacts] = await Promise.all([
    db.merchant.findMany({
      where: { name: { contains: args, mode: "insensitive" } },
      select: { name: true, status: true },
      take: 8,
    }),
    db.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: args, mode: "insensitive" } },
          { lastName: { contains: args, mode: "insensitive" } },
        ],
      },
      select: { firstName: true, lastName: true, merchant: { select: { name: true } } },
      take: 8,
    }),
  ]);
  if (merchants.length === 0 && contacts.length === 0) {
    await sendMessage(chatId, `No matches for "${escape(args)}".`);
    return;
  }
  const parts: string[] = [];
  if (merchants.length)
    parts.push(`🏪 <b>Merchants</b>\n${merchants.map((m) => `• ${escape(m.name)} (${m.status.toLowerCase()})`).join("\n")}`);
  if (contacts.length)
    parts.push(
      `👤 <b>Contacts</b>\n${contacts.map((c) => `• ${escape(c.firstName)} ${escape(c.lastName)} — ${escape(c.merchant.name)}`).join("\n")}`
    );
  await sendMessage(chatId, parts.join("\n\n"));
}

async function cmdMerchant(chatId: number, args: string) {
  if (!args.trim()) {
    await sendMessage(chatId, "Usage: /merchant <name>");
    return;
  }
  const match = await matchMerchant(args);
  if (match.status === "none") {
    await sendMessage(chatId, `No merchant named "${escape(args)}".`);
    return;
  }
  if (match.status === "ambiguous") {
    await sendMessage(chatId, `Several match: ${match.candidates.map((c) => escape(c.name)).join(", ")}. Be exact.`);
    return;
  }
  const [merchant, contactCount, deals, activities] = await Promise.all([
    db.merchant.findUnique({
      where: { id: match.merchant.id },
      select: { name: true, status: true, phone: true, category: true, owner: { select: { name: true } } },
    }),
    db.contact.count({ where: { merchantId: match.merchant.id } }),
    db.deal.findMany({
      where: { merchantId: match.merchant.id, stage: { notIn: ["WON", "LOST"] } },
      select: { title: true, stage: true },
      take: 5,
    }),
    listActivitiesForEntity(await getBotOwner(), "MERCHANT", match.merchant.id),
  ]);
  if (!merchant) return;
  const dealLines = deals.length ? deals.map((d) => `• ${escape(d.title)} (${d.stage.toLowerCase()})`).join("\n") : "None open";
  const actLines = activities.slice(0, 3).map((a) => `• ${a.type.toLowerCase()}: ${escape(a.subject)} (${formatDateTime(a.createdAt, "d MMM")})`).join("\n");
  const text =
    `🏪 <b>${escape(merchant.name)}</b> — ${merchant.status.toLowerCase()}\n` +
    `Owner: ${escape(merchant.owner?.name ?? "—")}${merchant.category ? ` · ${escape(merchant.category)}` : ""}${merchant.phone ? ` · ${escape(merchant.phone)}` : ""}\n` +
    `Contacts: ${contactCount}\n\n<b>Open deals</b>\n${dealLines}` +
    (actLines ? `\n\n<b>Recent activity</b>\n${actLines}` : "") +
    `\n\n<i>Reply /log &lt;note&gt; or /schedule to act on this merchant.</i>`;
  await sendRecord(chatId, text, "MERCHANT", match.merchant.id);
}

async function cmdLink(chatId: number, userId: string, args: string) {
  const email = args.trim().toLowerCase();
  if (!email) {
    await sendMessage(chatId, "Usage: /link you@perx.mv");
    return;
  }
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!user) {
    await sendMessage(chatId, `No CRM user with email "${escape(email)}".`);
    return;
  }
  await db.telegramUserLink.upsert({
    where: { telegramUserId: userId },
    create: { telegramUserId: userId, crmUserId: user.id },
    update: { crmUserId: user.id },
  });
  await sendMessage(chatId, `🔗 Linked to <b>${escape(user.name ?? email)}</b>. /mine now works.`);
}

// Routes a natural-language question through Ask Perx (read-only tools) and
// replies with the answer.
async function askAndReply(chatId: number, question: string) {
  const q = question.trim();
  if (!q) {
    await sendMessage(chatId, "Ask me a question, e.g. <code>/ask which merchants are active?</code>");
    return;
  }
  try {
    const answer = await answerAssistantQuestion(await getBotOwner(), q);
    await sendMessage(chatId, escape(answer));
  } catch (e) {
    await sendMessage(chatId, `⚠️ ${escape(e instanceof Error ? e.message : "I couldn't answer that right now.")}`);
  }
}

// ---- Reply-to-a-record actions ----

const REPLY_CMDS = new Set(["log", "detail", "move", "won", "lost", "done", "assign", "due"]);

async function handleReplyAction(
  msg: TgMessage,
  ref: { entityType: string; entityId: string },
  cmd: string,
  args: string
) {
  const chatId = msg.chat.id;
  const ctx = await getBotOwner();

  if (cmd === "log") {
    if (ref.entityType === "TASK") {
      await sendMessage(chatId, "Notes attach to merchants, contacts or deals — not tasks.");
      return;
    }
    if (!args.trim()) {
      await sendMessage(chatId, "Usage: reply /log <note>");
      return;
    }
    await createActivity(ctx, {
      type: "NOTE",
      subject: args.trim().slice(0, 300),
      entityType: ref.entityType as "MERCHANT" | "CONTACT" | "DEAL",
      entityId: ref.entityId,
    });
    await sendMessage(chatId, "📝 Note logged.");
    return;
  }

  if (ref.entityType === "DEAL") {
    try {
      if (cmd === "won") {
        await moveDealStage(ctx, ref.entityId, "WON");
        await sendMessage(chatId, "🏆 Deal marked won.");
      } else if (cmd === "lost") {
        await moveDealStage(ctx, ref.entityId, "LOST", args.trim() || undefined);
        await sendMessage(chatId, "Deal marked lost.");
      } else if (cmd === "move") {
        const stage = args.trim().toUpperCase();
        if (!(DEAL_STAGES as readonly string[]).includes(stage)) {
          await sendMessage(chatId, `Stage must be one of: ${DEAL_STAGES.join(", ").toLowerCase()}.`);
          return;
        }
        await moveDealStage(ctx, ref.entityId, stage as (typeof DEAL_STAGES)[number]);
        await sendMessage(chatId, `Deal moved to ${stage.toLowerCase()}.`);
      } else {
        await sendMessage(chatId, "That command doesn't apply to a deal. Try /move, /won, /lost or /log.");
      }
    } catch (e) {
      await sendMessage(chatId, `⚠️ ${escape(e instanceof Error ? e.message : "Couldn't update the deal")}.`);
    }
    return;
  }

  if (ref.entityType === "TASK") {
    try {
      if (cmd === "done") {
        await moveTask(ctx, ref.entityId, "DONE");
        await sendMessage(chatId, "✅ Task completed.");
      } else if (cmd === "assign") {
        const user = await db.user.findFirst({
          where: { name: { contains: args.trim(), mode: "insensitive" } },
          select: { id: true, name: true },
        });
        if (!user) {
          await sendMessage(chatId, `No team member matches "${escape(args)}".`);
          return;
        }
        await setTaskAssignee(ctx, ref.entityId, user.id);
        await sendMessage(chatId, `Assigned to ${escape(user.name ?? "them")}.`);
      } else if (cmd === "due") {
        const date = args.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          await sendMessage(chatId, "Usage: reply /due YYYY-MM-DD");
          return;
        }
        await setTaskDue(ctx, ref.entityId, `${date}T09:00`);
        await sendMessage(chatId, `Due date set to ${date}.`);
      } else {
        await sendMessage(chatId, "That command doesn't apply to a task. Try /done, /assign, /due or /log.");
      }
    } catch (e) {
      await sendMessage(chatId, `⚠️ ${escape(e instanceof Error ? e.message : "Couldn't update the task")}.`);
    }
    return;
  }

  await sendMessage(chatId, "Reply /log <note> or /schedule to act on this record.");
}

// ---- Money parsing ----

export function parseMoney(s: string): { value: string; currency: "MVR" | "USD" } | null {
  const num = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!num) return null;
  const currency = /\b(usd|\$|dollar)/i.test(s) ? "USD" : "MVR";
  return { value: num[1], currency };
}

// ---- Guided command flows ----

type FlowName = "new_merchant" | "new_contact" | "new_deal" | "new_task";

const FLOW_STEPS: Record<FlowName, { key: string; prompt: string }[]> = {
  new_merchant: [{ key: "name", prompt: "What's the merchant's name?" }],
  new_contact: [
    { key: "name", prompt: "Contact's full name?" },
    { key: "merchant", prompt: "Which merchant do they belong to? (exact name)" },
  ],
  new_deal: [
    { key: "merchant", prompt: "Which merchant is this deal for? (exact name)" },
    { key: "title", prompt: "Deal title? (e.g. POS rollout)" },
    { key: "value", prompt: "Deal value? (e.g. 5000 or 300 USD)" },
  ],
  new_task: [{ key: "title", prompt: "What's the task?" }],
};

function seedArgs(flow: FlowName, argStr: string, data: Record<string, string>) {
  const arg = argStr.trim();
  if (!arg) return;
  if (flow === "new_merchant") data.name = arg;
  else if (flow === "new_task") data.title = arg;
  else if (flow === "new_contact") {
    const parts = arg.split(/[@|]/).map((s) => s.trim()).filter(Boolean);
    if (parts[0]) data.name = parts[0];
    if (parts[1]) data.merchant = parts[1];
  } else if (flow === "new_deal") {
    const parts = arg.split("|").map((s) => s.trim()).filter(Boolean);
    const missing = FLOW_STEPS.new_deal.map((s) => s.key).filter((k) => !data[k]);
    parts.forEach((p, i) => {
      if (missing[i]) data[missing[i]] = p;
    });
  }
}

async function resolveMerchant(
  data: Record<string, string>
): Promise<{ id: string; name: string } | { error: string }> {
  if (data.merchantId && data.merchant) return { id: data.merchantId, name: data.merchant };
  const match = await matchMerchant(data.merchant ?? "");
  if (match.status === "one") return match.merchant;
  if (match.status === "none")
    return { error: `I couldn't find a merchant named "${data.merchant}". Add it first, or use the exact name.` };
  return {
    error: `Several merchants match "${data.merchant}": ${match.candidates
      .map((c) => c.name)
      .join(", ")}. Use the exact name.`,
  };
}

// Builds the pending action from a completed flow's data. Returns an error
// string to relay, or null on success (a confirm card was posted).
async function finalizeFlow(
  flow: FlowName,
  chatId: number,
  data: Record<string, string>,
  by: string | null
): Promise<string | null> {
  if (flow === "new_merchant") {
    const r = merchantSchema.safeParse({ name: data.name, status: "PROSPECT" });
    if (!r.success) return r.error.issues[0]?.message ?? "Invalid merchant";
    await proposeAction(chatId, "MERCHANT", r.data, `🏪 Add this merchant?\n<b>${escape(r.data.name)}</b>\nStatus: Prospect`, by);
    return null;
  }

  if (flow === "new_task") {
    const r = taskSchema.safeParse({ title: data.title });
    if (!r.success) return r.error.issues[0]?.message ?? "Invalid task";
    await proposeAction(chatId, "TASK", r.data, `✅ Add this task?\n<b>${escape(r.data.title)}</b>`, by);
    return null;
  }

  if (flow === "new_contact") {
    const merchant = await resolveMerchant(data);
    if ("error" in merchant) return merchant.error;
    const [firstName, ...rest] = (data.name ?? "").trim().split(/\s+/);
    const lastName = rest.join(" ") || "—";
    const r = contactSchema.safeParse({ firstName, lastName, merchantIds: [merchant.id] });
    if (!r.success) return r.error.issues[0]?.message ?? "Invalid contact";
    await proposeAction(
      chatId,
      "CONTACT",
      r.data,
      `👤 Add this contact?\n<b>${escape(firstName)} ${escape(lastName)}</b>\nMerchant: ${escape(merchant.name)}`,
      by
    );
    return null;
  }

  // new_deal
  const merchant = await resolveMerchant(data);
  if ("error" in merchant) return merchant.error;
  const money = parseMoney(data.value ?? "");
  if (!money) return "I couldn't read the deal value — try a number like 5000 or 300 USD.";
  const r = dealSchema.safeParse({
    title: data.title,
    merchantId: merchant.id,
    value: money.value,
    currency: money.currency,
  });
  if (!r.success) return r.error.issues[0]?.message ?? "Invalid deal";
  await proposeAction(
    chatId,
    "DEAL",
    r.data,
    `💼 Add this deal?\n<b>${escape(r.data.title)}</b>\nMerchant: ${escape(merchant.name)}\nValue: ${money.currency} ${Number(money.value).toLocaleString("en-US")}\nStage: New`,
    by
  );
  return null;
}

// Advances a flow: asks for the first still-missing field, or finalizes.
async function advanceFlow(
  flow: FlowName,
  chatId: number,
  userId: string,
  data: Record<string, string>,
  by: string | null
) {
  const missing = FLOW_STEPS[flow].find((s) => !data[s.key]);
  if (missing) {
    await db.telegramConvoState.upsert({
      where: { chatId_userId: { chatId: String(chatId), userId } },
      create: { chatId: String(chatId), userId, flow, data: JSON.parse(JSON.stringify(data)) },
      update: { flow, data: JSON.parse(JSON.stringify(data)) },
    });
    await sendMessage(chatId, `${missing.prompt}\n<i>(or /cancel)</i>`);
    return;
  }
  // Complete → clear state, finalize.
  await db.telegramConvoState.deleteMany({ where: { chatId: String(chatId), userId } });
  const err = await finalizeFlow(flow, chatId, data, by);
  if (err) await sendMessage(chatId, `🤔 ${escape(err)}`);
}

async function startFlow(flow: FlowName, msg: TgMessage, argStr: string, by: string | null, userId: string) {
  const data: Record<string, string> = {};
  seedArgs(flow, argStr, data);
  if ((flow === "new_contact" || flow === "new_deal") && !data.merchant) {
    const def = await getChatDefault(String(msg.chat.id));
    if (def) {
      data.merchant = def.merchantName;
      data.merchantId = def.merchantId;
    }
  }
  await advanceFlow(flow, msg.chat.id, userId, data, by);
}

// ---- Command routing ----

// `addressedTo` is the "@BotName" suffix Telegram appends when a command is
// picked from the menu in a group — it tells us whether the command was aimed
// at this bot or at another one in the same group.
function parseCommand(
  text: string
): { cmd: string; args: string; addressedTo: string | null } | null {
  const m = text.match(/^\/([a-z_]+)(?:@(\w+))?\s*([\s\S]*)$/i);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: m[3].trim(), addressedTo: m[2] ?? null };
}

// ---- who is being spoken to ------------------------------------------------
//
// A team group is a conversation between people; the bot is a participant, not
// the audience. So in a group it only acts when explicitly addressed: a slash
// command, an @mention, a reply to one of its own messages, or an answer to a
// question it just asked. In a private chat every message is already addressed
// to it, so no gate applies.

function isGroup(msg: TgMessage): boolean {
  // Telegram sends "private" | "group" | "supergroup" | "channel".
  return msg.chat.type !== undefined && msg.chat.type !== "private";
}

function mentionPattern(username: string): RegExp {
  // Usernames are [A-Za-z0-9_], so this needs no escaping.
  return new RegExp(`@${username}\\b`, "i");
}

function isMentioned(text: string, me: BotIdentity | null): boolean {
  // Without a known username (getMe failed) fall back to "starts with some
  // @handle" — looser, but it keeps mentions working during an outage.
  if (!me) return /^@\w+/.test(text);
  return mentionPattern(me.username).test(text);
}

function isReplyToBot(msg: TgMessage, me: BotIdentity | null): boolean {
  const from = msg.reply_to_message?.from;
  if (!from) return false;
  return me ? from.id === me.id : Boolean(from.is_bot);
}

// Removes the @mention so the rest of the pipeline sees a clean instruction.
function stripMention(text: string, me: BotIdentity | null): string {
  const without = me
    ? text.replace(new RegExp(`@${me.username}\\b`, "gi"), " ")
    : text.replace(/^@\w+/, " ");
  return without.replace(/\s+/g, " ").trim();
}

const HELP = [
  "<b>Perx CRM bot</b> — I turn group posts into CRM records (with a confirm tap).",
  "",
  "<b>Create</b>",
  "/new_merchant Ocean Bubbles",
  "/new_contact Ali Rasheed @ Ocean Bubbles",
  "/new_deal Ocean Bubbles | POS rollout | 5000 MVR",
  "/new_task Follow up with Ocean Bubbles",
  "/schedule Ocean Bubbles tomorrow 3pm",
  "",
  "<b>Context</b>",
  "/use Ocean Bubbles — set a default merchant for this chat",
  "/current — show it",
  "",
  "<b>In a group I only reply when you talk to me</b> — a command, an @mention,",
  "or a reply to one of my messages. Otherwise I stay out of the conversation.",
  "",
  "Mention me to ask or capture anything, e.g.",
  "<i>“@PerxCRMBot which merchants are active?”</i>",
  "<i>“@PerxCRMBot meeting with Ocean Bubbles tomorrow 3pm”</i>",
  "Run a create command with no details and I'll ask step by step.",
].join("\n");

async function handleCommand(msg: TgMessage, cmd: string, args: string, by: string | null, userId: string) {
  const chatId = msg.chat.id;

  // Reply-to-a-record actions need the message being replied to.
  if (REPLY_CMDS.has(cmd)) {
    const replyMid = msg.reply_to_message?.message_id;
    if (!replyMid) {
      await sendMessage(chatId, "↩️ Reply to a deal/task/merchant message (from /deals, /tasks or /merchant), then use this command.");
      return;
    }
    const ref = await db.telegramMessageRef.findUnique({
      where: { chatId_messageId: { chatId: String(chatId), messageId: String(replyMid) } },
    });
    if (!ref) {
      await sendMessage(chatId, "I don't recognise that message. Use /deals, /tasks or /merchant to get one you can reply to.");
      return;
    }
    await handleReplyAction(msg, ref, cmd, args);
    return;
  }

  switch (cmd) {
    case "start":
    case "help":
    case "hello":
      await sendMessage(chatId, HELP);
      return;
    case "bye":
      await sendMessage(chatId, "👋 Until next time!");
      return;
    case "cancel":
      await db.telegramConvoState.deleteMany({ where: { chatId: String(chatId), userId } });
      await sendMessage(chatId, "Cancelled.");
      return;
    case "current": {
      const def = await getChatDefault(String(chatId));
      await sendMessage(
        chatId,
        def ? `📌 Default merchant: <b>${escape(def.merchantName)}</b>` : "No default merchant set. Use /use <name>."
      );
      return;
    }
    case "use": {
      if (!args) {
        await sendMessage(chatId, "Usage: /use <merchant name>");
        return;
      }
      const match = await matchMerchant(args);
      if (match.status === "none") {
        await sendMessage(chatId, `🤔 No merchant named "${escape(args)}".`);
        return;
      }
      if (match.status === "ambiguous") {
        await sendMessage(chatId, `🤔 Several match: ${match.candidates.map((c) => escape(c.name)).join(", ")}. Be exact.`);
        return;
      }
      await db.telegramChatDefault.upsert({
        where: { chatId: String(chatId) },
        create: { chatId: String(chatId), merchantId: match.merchant.id, merchantName: match.merchant.name },
        update: { merchantId: match.merchant.id, merchantName: match.merchant.name },
      });
      await sendMessage(chatId, `📌 Default merchant set to <b>${escape(match.merchant.name)}</b>.`);
      return;
    }
    case "new_merchant":
    case "new_contact":
    case "new_deal":
    case "new_task":
      await startFlow(cmd, msg, args, by, userId);
      return;
    case "merchants":
      await cmdMerchants(chatId, args);
      return;
    case "deals":
      await cmdDeals(chatId, args);
      return;
    case "tasks":
      await cmdTasks(chatId, args);
      return;
    case "mine":
      await cmdMine(chatId, userId);
      return;
    case "find":
      await cmdFind(chatId, args);
      return;
    case "merchant":
      await cmdMerchant(chatId, args);
      return;
    case "link":
      await cmdLink(chatId, userId, args);
      return;
    case "ask":
      await askAndReply(chatId, args);
      return;
    case "schedule": {
      if (!args) {
        await db.telegramConvoState.deleteMany({ where: { chatId: String(chatId), userId } });
        await sendMessage(chatId, "Who and when? e.g. <i>Ocean Bubbles tomorrow 3pm</i>\n<i>(or /cancel)</i>");
        await db.telegramConvoState.create({
          data: { chatId: String(chatId), userId, flow: "schedule", data: {} },
        });
        return;
      }
      await handleScheduleText(msg, args, by);
      return;
    }
    default:
      await sendMessage(chatId, "Unknown command. Try /help.");
  }
}

async function handleScheduleText(msg: TgMessage, text: string, by: string | null) {
  const extracted = await extractIntent(`Schedule a meeting: ${text}`);
  if (!extracted || extracted.intent !== "meeting") {
    await sendMessage(msg.chat.id, "🤔 I couldn't read a merchant + time from that. Try e.g. <i>Ocean Bubbles tomorrow 3pm</i>.");
    return;
  }
  await handleMeetingIntent(msg, extracted, by);
}

// ---- Free-text message handling ----

async function handleMessage(msg: TgMessage) {
  const text = msg.text?.trim();
  if (!text || msg.from?.is_bot) return;
  const userId = msg.from?.id ? String(msg.from.id) : "unknown";
  const by = personName(msg.from);

  const me = await getMe();

  // 1) Slash command? "/help@SomeOtherBot" in a shared group isn't ours.
  const command = parseCommand(text);
  if (command) {
    if (command.addressedTo && me && command.addressedTo.toLowerCase() !== me.username.toLowerCase()) {
      return;
    }
    return handleCommand(msg, command.cmd, command.args, by, userId);
  }

  // 2) Continuing a guided flow?
  const state = await db.telegramConvoState.findUnique({
    where: { chatId_userId: { chatId: String(msg.chat.id), userId } },
  });
  if (state) {
    if (state.flow === "schedule") {
      await db.telegramConvoState.deleteMany({ where: { chatId: String(msg.chat.id), userId } });
      await handleScheduleText(msg, text, by);
      return;
    }
    const data = (state.data as Record<string, string>) ?? {};
    const nextKey = FLOW_STEPS[state.flow as FlowName].find((s) => !data[s.key]);
    if (nextKey) data[nextKey.key] = text;
    await advanceFlow(state.flow as FlowName, msg.chat.id, userId, data, by);
    return;
  }

  // 3) Past this point the bot would be speaking up on its own, so in a group
  // it must have been addressed. Everything else is team chatter — stay out.
  const addressed = isMentioned(text, me) || isReplyToBot(msg, me);
  if (isGroup(msg) && !addressed) return;

  const body = stripMention(text, me);
  if (!body) {
    // A bare "@PerxCRMBot" with nothing else.
    await sendMessage(msg.chat.id, NUDGE);
    return;
  }

  // 4) A question? Route it to Ask Perx (read-only) and answer in the chat.
  if (body.endsWith("?")) {
    await askAndReply(msg.chat.id, body);
    return;
  }

  // 5) Natural-language create capture.
  if (ACTION_HINT.test(body)) {
    const extracted = await extractIntent(body);
    if (extracted && extracted.intent !== "none") {
      if (extracted.intent === "meeting") return handleMeetingIntent(msg, extracted, by);
      if (extracted.intent === "merchant") return handleMerchantIntent(msg, extracted, by);
      if (extracted.intent === "contact") return handleContactIntent(msg, extracted, by);
    }
  }

  // 6) Addressed, but nothing matched. Say so rather than going quiet —
  // silence after a direct mention is indistinguishable from being broken.
  await sendMessage(msg.chat.id, NUDGE);
}

async function handleMeetingIntent(
  msg: TgMessage,
  parsed: Extract<Extracted, { intent: "meeting" }>,
  by: string | null
) {
  const startAt = parseMvLocal(parsed.startLocal);
  if (Number.isNaN(startAt.getTime())) {
    await sendMessage(msg.chat.id, "🤔 I couldn't pin down the date/time. Try including a day and time, e.g. <i>Tue 3pm</i>.");
    return;
  }
  if (startAt.getTime() < Date.now()) {
    await sendMessage(msg.chat.id, "🤔 That time looks like it's in the past — please include a future date/time.");
    return;
  }
  const match = await matchMerchant(parsed.merchantName);
  if (match.status === "none") {
    await sendMessage(msg.chat.id, `🤔 I couldn't find a merchant named <b>${escape(parsed.merchantName)}</b>. Add it first, or use the exact name.`);
    return;
  }
  if (match.status === "ambiguous") {
    await sendMessage(msg.chat.id, `🤔 Several merchants match <b>${escape(parsed.merchantName)}</b>: ${match.candidates.map((c) => escape(c.name)).join(", ")}. Use the exact name.`);
    return;
  }

  const durationMins =
    typeof parsed.durationMins === "number" && parsed.durationMins > 0 ? Math.min(parsed.durationMins, 480) : 30;
  const title = parsed.title?.trim() || `Meeting with ${match.merchant.name}`;

  const pending = await db.telegramPendingMeeting.create({
    data: {
      chatId: String(msg.chat.id),
      merchantId: match.merchant.id,
      merchantName: match.merchant.name,
      title,
      startAt,
      durationMins,
      createdByName: by,
    },
  });
  const sent = await sendMessage(
    msg.chat.id,
    `📅 Create this meeting?\n<b>${escape(title)}</b>\nMerchant: ${escape(match.merchant.name)}\nWhen: ${formatDateTime(startAt)} (MV time)\nDuration: ${durationMins} min`,
    confirmButtons(CB_MEETING, pending.id)
  );
  await db.telegramPendingMeeting.update({
    where: { id: pending.id },
    data: { confirmationMessageId: String(sent.message_id) },
  });
}

async function handleMerchantIntent(
  msg: TgMessage,
  parsed: Extract<Extracted, { intent: "merchant" }>,
  by: string | null
) {
  const result = merchantSchema.safeParse({
    name: parsed.name,
    status: "PROSPECT",
    category: parsed.category ?? undefined,
    phone: parsed.phone ?? undefined,
    email: parsed.email ?? undefined,
    address: parsed.address ?? undefined,
  });
  if (!result.success) {
    await sendMessage(msg.chat.id, `🤔 I couldn't add that merchant: ${escape(result.error.issues[0]?.message ?? "invalid details")}.`);
    return;
  }
  const lines = [
    "Status: Prospect",
    result.data.category ? `Category: ${escape(result.data.category)}` : null,
    result.data.phone ? `Phone: ${escape(result.data.phone)}` : null,
    result.data.email ? `Email: ${escape(result.data.email)}` : null,
    result.data.address ? `Address: ${escape(result.data.address)}` : null,
  ].filter(Boolean);
  await proposeAction(msg.chat.id, "MERCHANT", result.data, `🏪 Add this merchant?\n<b>${escape(result.data.name)}</b>\n${lines.join("\n")}`, by);
}

async function handleContactIntent(
  msg: TgMessage,
  parsed: Extract<Extracted, { intent: "contact" }>,
  by: string | null
) {
  const match = await matchMerchant(parsed.merchantName);
  if (match.status === "none") {
    await sendMessage(msg.chat.id, `🤔 I couldn't find a merchant named <b>${escape(parsed.merchantName)}</b> to attach this contact to. Add the merchant first.`);
    return;
  }
  if (match.status === "ambiguous") {
    await sendMessage(msg.chat.id, `🤔 Several merchants match <b>${escape(parsed.merchantName)}</b>: ${match.candidates.map((c) => escape(c.name)).join(", ")}. Use the exact name.`);
    return;
  }
  const result = contactSchema.safeParse({
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    title: parsed.title ?? undefined,
    phone: parsed.phone ?? undefined,
    email: parsed.email ?? undefined,
    merchantIds: [match.merchant.id],
  });
  if (!result.success) {
    await sendMessage(msg.chat.id, `🤔 I couldn't add that contact: ${escape(result.error.issues[0]?.message ?? "invalid details")}.`);
    return;
  }
  const lines = [
    `Merchant: ${escape(match.merchant.name)}`,
    result.data.title ? `Title: ${escape(result.data.title)}` : null,
    result.data.phone ? `Phone: ${escape(result.data.phone)}` : null,
    result.data.email ? `Email: ${escape(result.data.email)}` : null,
  ].filter(Boolean);
  await proposeAction(msg.chat.id, "CONTACT", result.data, `👤 Add this contact?\n<b>${escape(result.data.firstName)} ${escape(result.data.lastName)}</b>\n${lines.join("\n")}`, by);
}

// ---- Callback (Confirm / Cancel) handling ----

async function handleMeetingCallback(cb: TgCallbackQuery, action: string, id: string) {
  const pending = await db.telegramPendingMeeting.findUnique({ where: { id } });
  const chatId = pending?.chatId ?? cb.message?.chat.id;
  if (!pending || pending.status !== "PENDING") {
    await answerCallbackQuery(cb.id, "Already handled.");
    return;
  }
  if (action === "cancel") {
    await db.telegramPendingMeeting.update({ where: { id }, data: { status: "CANCELLED" } });
    if (chatId && pending.confirmationMessageId) await editMessageText(chatId, pending.confirmationMessageId, "❌ Cancelled.");
    await answerCallbackQuery(cb.id, "Cancelled");
    return;
  }
  const host = await getTelegramMeetingHost();
  if (!host) {
    await answerCallbackQuery(cb.id, "No meeting host is configured in the CRM.");
    return;
  }
  await createSharedMeeting({
    hostUserId: host.id,
    merchantId: pending.merchantId,
    merchantName: pending.merchantName,
    title: pending.title,
    startAt: pending.startAt,
    durationMins: pending.durationMins,
    source: "Telegram",
  });
  await db.telegramPendingMeeting.update({ where: { id }, data: { status: "CONFIRMED" } });
  if (chatId && pending.confirmationMessageId) {
    await editMessageText(
      chatId,
      pending.confirmationMessageId,
      `✅ Added: <b>${escape(pending.title)}</b> with ${escape(pending.merchantName)} on ${formatDateTime(pending.startAt)} (MV time). Synced to the team calendar${host.name ? ` (${escape(host.name)})` : ""}.`
    );
  }
  await answerCallbackQuery(cb.id, "Meeting created");
}

async function handleActionCallback(cb: TgCallbackQuery, action: string, id: string) {
  const pending = await db.telegramPendingAction.findUnique({ where: { id } });
  const chatId = pending?.chatId ?? cb.message?.chat.id;
  if (!pending || pending.status !== "PENDING") {
    await answerCallbackQuery(cb.id, "Already handled.");
    return;
  }
  if (action === "cancel") {
    await db.telegramPendingAction.update({ where: { id }, data: { status: "CANCELLED" } });
    if (chatId && pending.confirmationMessageId) await editMessageText(chatId, pending.confirmationMessageId, "❌ Cancelled.");
    await answerCallbackQuery(cb.id, "Cancelled");
    return;
  }

  const ctx = await getBotOwner();
  try {
    let label: string;
    let path: string;
    let recordId: string;
    if (pending.kind === "MERCHANT") {
      const m = await createMerchant(ctx, pending.payload as unknown as MerchantInput);
      label = `Merchant added: <b>${escape(m.name)}</b>`;
      path = `/merchants/${m.id}`;
      recordId = m.id;
    } else if (pending.kind === "CONTACT") {
      const c = await createContact(ctx, pending.payload as unknown as ContactInput);
      label = `Contact added: <b>${escape(c.firstName)} ${escape(c.lastName)}</b>`;
      path = `/contacts/${c.id}`;
      recordId = c.id;
    } else if (pending.kind === "DEAL") {
      const d = await createDeal(ctx, pending.payload as unknown as DealInput);
      label = `Deal added: <b>${escape(d.title)}</b>`;
      path = `/deals/${d.id}`;
      recordId = d.id;
    } else {
      const t = await createTask(ctx, pending.payload as unknown as TaskInput);
      label = `Task added: <b>${escape(t.title)}</b>`;
      path = `/tasks`;
      recordId = t.id;
    }
    await db.telegramPendingAction.update({ where: { id }, data: { status: "CONFIRMED", recordId } });
    if (chatId && pending.confirmationMessageId) {
      const link = appUrl() ? `\n${appUrl()}${path}` : "";
      await editMessageText(chatId, pending.confirmationMessageId, `✅ ${label} (owner: Sales).${link}`);
    }
    await answerCallbackQuery(cb.id, "Created");
  } catch (e) {
    await answerCallbackQuery(cb.id, "Couldn't create the record.");
    if (chatId) await sendMessage(chatId, `⚠️ Couldn't create the record: ${escape(e instanceof Error ? e.message : "unknown error")}.`);
  }
}

async function handleCallback(cb: TgCallbackQuery) {
  const [prefix, action, id] = (cb.data ?? "").split(":");
  if (!id || (action !== "confirm" && action !== "cancel")) {
    await answerCallbackQuery(cb.id);
    return;
  }
  if (prefix === CB_MEETING) return handleMeetingCallback(cb, action, id);
  if (prefix === CB_ACTION) return handleActionCallback(cb, action, id);
  await answerCallbackQuery(cb.id);
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message) return handleMessage(update.message);
}
