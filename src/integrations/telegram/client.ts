// Thin Telegram Bot API client. Reads TELEGRAM_BOT_TOKEN from the environment;
// when it's unset every call throws, and telegramConfigured() is false so the
// webhook can short-circuit.

const API_BASE = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

export type InlineButton = { text: string; callback_data: string };

// Who am I? Needed to tell a mention of this bot from a mention of anyone
// else, and to spot replies to its own messages. Cached for the life of the
// process — a bot's id and username don't change without a BotFather action.
export type BotIdentity = { id: number; username: string };

let identity: BotIdentity | null = null;

export async function getMe(): Promise<BotIdentity | null> {
  if (identity) return identity;
  try {
    const me = await call<{ id: number; username?: string }>("getMe", {});
    if (!me?.username) return null;
    identity = { id: me.id, username: me.username };
    return identity;
  } catch {
    // Never let an identity lookup failure drop the update; the caller
    // degrades to a looser mention check.
    return null;
  }
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][]
): Promise<{ message_id: number }> {
  const replyMarkup = buttons ? { reply_markup: { inline_keyboard: buttons } } : {};
  try {
    return await call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...replyMarkup });
  } catch (e) {
    // A stray "<" or "&" in dynamic content can break HTML parsing — never let
    // that swallow the whole message. Retry as plain text with tags stripped.
    if (e instanceof Error && /can't parse entities|unsupported start tag/i.test(e.message)) {
      const plain = text.replace(/<[^>]+>/g, "");
      return await call("sendMessage", { chat_id: chatId, text: plain, ...replyMarkup });
    }
    throw e;
  }
}

export function editMessageText(
  chatId: string | number,
  messageId: number | string,
  text: string
): Promise<unknown> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: Number(messageId),
    text,
    parse_mode: "HTML",
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
  return call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

// Registers the webhook with Telegram. `secret` is echoed back on every update
// in the X-Telegram-Bot-Api-Secret-Token header so we can verify authenticity.
export function setWebhook(url: string, secret: string): Promise<unknown> {
  return call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
}

// Populates the bot's command menu (the "Menu" button in the chat).
export function setMyCommands(
  commands: { command: string; description: string }[]
): Promise<unknown> {
  return call("setMyCommands", { commands });
}
