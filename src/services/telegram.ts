import { getAiProvider } from "@/integrations/ai";
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
} from "@/integrations/telegram/client";
import { formatDateTime, parseMvLocal } from "@/lib/datetime";
import { db } from "@/lib/db";
import { escapeHtml as escape } from "@/lib/html";
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

// Only bother the LLM when a message plausibly schedules something — keeps us
// from calling the model on every line of group chatter.
const MEETING_HINT =
  /\b(meeting|meet|meet-up|meetup|call|visit|demo|appointment|schedule|scheduled|catch\s?up|sync|session)\b/i;

const CB_PREFIX = "tgm";

type ParsedMeeting = {
  merchantName: string;
  startLocal: string; // YYYY-MM-DDTHH:mm, Maldives local
  durationMins: number;
  title: string;
};

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

async function extractMeeting(text: string): Promise<ParsedMeeting | null> {
  const today = formatDateTime(new Date(), "EEEE, d MMMM yyyy");
  const system =
    `You extract meeting details from a single team-chat message about scheduling a meeting with a merchant/client. ` +
    `Today is ${today} (Maldives time, UTC+5). ` +
    `Respond ONLY with minified JSON, no prose or code fences. ` +
    `Schema: {"isMeeting":boolean,"merchantName":string,"startLocal":"YYYY-MM-DDTHH:mm","durationMins":number,"title":string}. ` +
    `startLocal is Maldives local time, 24-hour. Resolve relative dates/times ("tomorrow","Tue 3pm") against today. ` +
    `Default durationMins to 30 and title to "Meeting with <merchantName>" when unspecified. ` +
    `If the message does not schedule a specific meeting, return {"isMeeting":false}.`;

  const parsed = parseJson<Partial<ParsedMeeting> & { isMeeting?: boolean }>(
    await runCompletion(system, text)
  );
  if (!parsed || parsed.isMeeting === false) return null;
  if (!parsed.merchantName || !parsed.startLocal) return null;

  return {
    merchantName: parsed.merchantName,
    startLocal: parsed.startLocal,
    durationMins:
      typeof parsed.durationMins === "number" && parsed.durationMins > 0
        ? Math.min(parsed.durationMins, 480)
        : 30,
    title: parsed.title?.trim() || `Meeting with ${parsed.merchantName}`,
  };
}

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

async function handleMessage(msg: TgMessage) {
  const text = msg.text?.trim();
  if (!text || text.startsWith("/") || msg.from?.is_bot) return;
  if (!MEETING_HINT.test(text)) return;

  const parsed = await extractMeeting(text);
  if (!parsed) return;

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
    await sendMessage(
      msg.chat.id,
      `🤔 I couldn't find a merchant named <b>${escape(parsed.merchantName)}</b> in the CRM. Add it first, or repost with the exact name.`
    );
    return;
  }
  if (match.status === "ambiguous") {
    const names = match.candidates.map((c) => `• ${escape(c.name)}`).join("\n");
    await sendMessage(
      msg.chat.id,
      `🤔 Several merchants match <b>${escape(parsed.merchantName)}</b>:\n${names}\nRepost with the exact name.`
    );
    return;
  }

  const pending = await db.telegramPendingMeeting.create({
    data: {
      chatId: String(msg.chat.id),
      merchantId: match.merchant.id,
      merchantName: match.merchant.name,
      title: parsed.title,
      startAt,
      durationMins: parsed.durationMins,
      createdByName: personName(msg.from),
    },
  });

  const when = formatDateTime(startAt);
  const sent = await sendMessage(
    msg.chat.id,
    `📅 Create this meeting?\n<b>${escape(parsed.title)}</b>\nMerchant: ${escape(match.merchant.name)}\nWhen: ${when} (MV time)\nDuration: ${parsed.durationMins} min`,
    [
      [
        { text: "✅ Create", callback_data: `${CB_PREFIX}:confirm:${pending.id}` },
        { text: "❌ Cancel", callback_data: `${CB_PREFIX}:cancel:${pending.id}` },
      ],
    ]
  );

  await db.telegramPendingMeeting.update({
    where: { id: pending.id },
    data: { confirmationMessageId: String(sent.message_id) },
  });
}

async function handleCallback(cb: TgCallbackQuery) {
  const data = cb.data ?? "";
  const [prefix, action, id] = data.split(":");
  if (prefix !== CB_PREFIX || !id) {
    await answerCallbackQuery(cb.id);
    return;
  }

  const pending = await db.telegramPendingMeeting.findUnique({ where: { id } });
  const chatId = pending?.chatId ?? cb.message?.chat.id;
  if (!pending || pending.status !== "PENDING") {
    await answerCallbackQuery(cb.id, "Already handled.");
    return;
  }

  if (action === "cancel") {
    await db.telegramPendingMeeting.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    if (chatId && pending.confirmationMessageId) {
      await editMessageText(chatId, pending.confirmationMessageId, "❌ Cancelled.");
    }
    await answerCallbackQuery(cb.id, "Cancelled");
    return;
  }

  if (action === "confirm") {
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
    await db.telegramPendingMeeting.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });
    const when = formatDateTime(pending.startAt);
    if (chatId && pending.confirmationMessageId) {
      await editMessageText(
        chatId,
        pending.confirmationMessageId,
        `✅ Added to the CRM: <b>${escape(pending.title)}</b> with ${escape(pending.merchantName)} on ${when} (MV time). Synced to the team calendar${host.name ? ` (${escape(host.name)})` : ""}.`
      );
    }
    await answerCallbackQuery(cb.id, "Meeting created");
    return;
  }

  await answerCallbackQuery(cb.id);
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message) return handleMessage(update.message);
}
