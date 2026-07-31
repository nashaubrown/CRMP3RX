import { getAiProvider } from "@/integrations/ai";
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
} from "@/integrations/telegram/client";
import type { SessionUser } from "@/lib/authz";
import { formatDateTime, parseMvLocal } from "@/lib/datetime";
import { db } from "@/lib/db";
import { escapeHtml as escape } from "@/lib/html";
import { contactSchema, type ContactInput } from "@/lib/validators/contact";
import { merchantSchema, type MerchantInput } from "@/lib/validators/merchant";
import { createContact } from "@/services/contacts";
import { createMerchant } from "@/services/merchants";
import { createSharedMeeting, getTelegramMeetingHost } from "@/services/scheduling";

// ---- Telegram update shapes (only the fields we use) ----
type TgUser = { first_name?: string; username?: string; is_bot?: boolean };
type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
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

// Only bother the LLM when a message plausibly asks to schedule a meeting or add
// a record — keeps us from calling the model on every line of group chatter.
const ACTION_HINT =
  /\b(meeting|meet|meet-up|meetup|call|visit|demo|appointment|schedule|scheduled|catch\s?up|sync|session|add|new|create|onboard|register|sign\s?up|merchant|contact|client|lead)\b/i;

const CB_MEETING = "tgm"; // meeting confirmations
const CB_ACTION = "tga"; // merchant/contact confirmations

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

// ---- AI extraction ----

type Extracted =
  | {
      intent: "meeting";
      merchantName: string;
      startLocal: string;
      durationMins: number;
      title: string;
    }
  | {
      intent: "merchant";
      name: string;
      category?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
    }
  | {
      intent: "contact";
      firstName: string;
      lastName: string;
      merchantName: string;
      title?: string | null;
      phone?: string | null;
      email?: string | null;
    }
  | { intent: "none" };

async function runCompletion(system: string, user: string): Promise<string | null> {
  const provider = await getAiProvider();
  if (!provider) return null;
  let text = "";
  for await (const ev of provider.streamTurn({
    system,
    messages: [{ role: "user", content: user }],
    tools: [],
  })) {
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
    `Rules: startLocal is Maldives local 24-hour time; resolve relative dates ("tomorrow","Tue 3pm") against today. Meeting durationMins defaults to 30, title to "Meeting with <merchantName>". ` +
    `"merchant" = onboarding/adding a business. "contact" = adding a person (needs the merchant/business they belong to). ` +
    `Keep phone numbers as written. If the message is chit-chat or none of these, return {"intent":"none"}.`;

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

  // Prefer a single exact (case-insensitive) name match when the fuzzy set is
  // broad.
  const exact = matches.filter((m) => m.name.toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return { status: "one", merchant: exact[0] };
  return { status: "ambiguous", candidates: matches };
}

function personName(from?: TgUser): string | null {
  if (!from) return null;
  return from.first_name ?? from.username ?? null;
}

// Bot-created records are owned by a shared "Sales" system account (created on
// demand, admin so it can attach contacts to any merchant, no password so it
// can't log in). A rep can reassign ownership later in the CRM.
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

// ---- Confirmation cards ----

function confirmButtons(prefix: string, id: string) {
  return [
    [
      { text: "✅ Create", callback_data: `${prefix}:confirm:${id}` },
      { text: "❌ Cancel", callback_data: `${prefix}:cancel:${id}` },
    ],
  ];
}

// ---- Message handling ----

async function handleMessage(msg: TgMessage) {
  const text = msg.text?.trim();
  if (!text || text.startsWith("/") || msg.from?.is_bot) return;
  if (!ACTION_HINT.test(text)) return;

  const extracted = await extractIntent(text);
  if (!extracted || extracted.intent === "none") return;

  const by = personName(msg.from);
  if (extracted.intent === "meeting") return handleMeetingIntent(msg, extracted, by);
  if (extracted.intent === "merchant") return handleMerchantIntent(msg, extracted, by);
  if (extracted.intent === "contact") return handleContactIntent(msg, extracted, by);
}

async function handleMeetingIntent(
  msg: TgMessage,
  parsed: Extract<Extracted, { intent: "meeting" }>,
  by: string | null
) {
  const startAt = parseMvLocal(parsed.startLocal);
  if (Number.isNaN(startAt.getTime())) {
    await sendMessage(msg.chat.id, "🤔 I spotted a meeting but couldn't pin down the date/time. Try including a day and time, e.g. <i>Tue 3pm</i>.");
    return;
  }
  if (startAt.getTime() < Date.now()) {
    await sendMessage(msg.chat.id, "🤔 That meeting time looks like it's in the past — please include a future date/time.");
    return;
  }

  const match = await matchMerchant(parsed.merchantName);
  if (match.status === "none") {
    await sendMessage(msg.chat.id, `🤔 I couldn't find a merchant named <b>${escape(parsed.merchantName)}</b>. Add it first, or repost with the exact name.`);
    return;
  }
  if (match.status === "ambiguous") {
    const names = match.candidates.map((c) => `• ${escape(c.name)}`).join("\n");
    await sendMessage(msg.chat.id, `🤔 Several merchants match <b>${escape(parsed.merchantName)}</b>:\n${names}\nRepost with the exact name.`);
    return;
  }

  const durationMins =
    typeof parsed.durationMins === "number" && parsed.durationMins > 0
      ? Math.min(parsed.durationMins, 480)
      : 30;
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

  const when = formatDateTime(startAt);
  const sent = await sendMessage(
    msg.chat.id,
    `📅 Create this meeting?\n<b>${escape(title)}</b>\nMerchant: ${escape(match.merchant.name)}\nWhen: ${when} (MV time)\nDuration: ${durationMins} min`,
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
    `Status: Prospect`,
    result.data.category ? `Category: ${escape(result.data.category)}` : null,
    result.data.phone ? `Phone: ${escape(result.data.phone)}` : null,
    result.data.email ? `Email: ${escape(result.data.email)}` : null,
    result.data.address ? `Address: ${escape(result.data.address)}` : null,
  ].filter(Boolean);
  const summary = `🏪 Add this merchant?\n<b>${escape(result.data.name)}</b>\n${lines.join("\n")}`;

  const pending = await db.telegramPendingAction.create({
    data: {
      chatId: String(msg.chat.id),
      kind: "MERCHANT",
      payload: JSON.parse(JSON.stringify(result.data)),
      summary,
      createdByName: by,
    },
  });
  const sent = await sendMessage(msg.chat.id, summary, confirmButtons(CB_ACTION, pending.id));
  await db.telegramPendingAction.update({
    where: { id: pending.id },
    data: { confirmationMessageId: String(sent.message_id) },
  });
}

async function handleContactIntent(
  msg: TgMessage,
  parsed: Extract<Extracted, { intent: "contact" }>,
  by: string | null
) {
  const match = await matchMerchant(parsed.merchantName);
  if (match.status === "none") {
    await sendMessage(msg.chat.id, `🤔 I couldn't find a merchant named <b>${escape(parsed.merchantName)}</b> to attach this contact to. Add the merchant first, or use its exact name.`);
    return;
  }
  if (match.status === "ambiguous") {
    const names = match.candidates.map((c) => `• ${escape(c.name)}`).join("\n");
    await sendMessage(msg.chat.id, `🤔 Several merchants match <b>${escape(parsed.merchantName)}</b>:\n${names}\nRepost with the exact name.`);
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
  const summary = `👤 Add this contact?\n<b>${escape(result.data.firstName)} ${escape(result.data.lastName)}</b>\n${lines.join("\n")}`;

  const pending = await db.telegramPendingAction.create({
    data: {
      chatId: String(msg.chat.id),
      kind: "CONTACT",
      payload: JSON.parse(JSON.stringify(result.data)),
      summary,
      createdByName: by,
    },
  });
  const sent = await sendMessage(msg.chat.id, summary, confirmButtons(CB_ACTION, pending.id));
  await db.telegramPendingAction.update({
    where: { id: pending.id },
    data: { confirmationMessageId: String(sent.message_id) },
  });
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
  const when = formatDateTime(pending.startAt);
  if (chatId && pending.confirmationMessageId) {
    await editMessageText(chatId, pending.confirmationMessageId, `✅ Added to the CRM: <b>${escape(pending.title)}</b> with ${escape(pending.merchantName)} on ${when} (MV time). Synced to the team calendar${host.name ? ` (${escape(host.name)})` : ""}.`);
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
    if (pending.kind === "MERCHANT") {
      const merchant = await createMerchant(ctx, pending.payload as unknown as MerchantInput);
      await db.telegramPendingAction.update({ where: { id }, data: { status: "CONFIRMED", recordId: merchant.id } });
      if (chatId && pending.confirmationMessageId) {
        const link = appUrl() ? `\n${appUrl()}/merchants/${merchant.id}` : "";
        await editMessageText(chatId, pending.confirmationMessageId, `✅ Merchant added: <b>${escape(merchant.name)}</b> (owner: Sales).${link}`);
      }
      await answerCallbackQuery(cb.id, "Merchant created");
    } else {
      const contact = await createContact(ctx, pending.payload as unknown as ContactInput);
      await db.telegramPendingAction.update({ where: { id }, data: { status: "CONFIRMED", recordId: contact.id } });
      if (chatId && pending.confirmationMessageId) {
        const link = appUrl() ? `\n${appUrl()}/contacts/${contact.id}` : "";
        await editMessageText(chatId, pending.confirmationMessageId, `✅ Contact added: <b>${escape(contact.firstName)} ${escape(contact.lastName)}</b> (owner: Sales).${link}`);
      }
      await answerCallbackQuery(cb.id, "Contact created");
    }
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
