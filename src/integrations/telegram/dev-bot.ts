// Sender for dev-ticket notifications, kept separate from the sales bot so
// developer traffic can live on its own bot (and in its own group chat).
//
// Token resolution: TELEGRAM_DEV_BOT_TOKEN when set, else the main
// TELEGRAM_BOT_TOKEN. DMs go by Telegram user id, which is bot-independent —
// but Telegram only lets a bot DM someone who has pressed Start on THAT bot,
// so when the dev bot goes live each recipient opens it once and taps Start.
// TELEGRAM_DEV_CHAT_ID (optional) is a group chat that hears every event.

const API_BASE = "https://api.telegram.org";

function devToken(): string | null {
  return process.env.TELEGRAM_DEV_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || null;
}

export function devTelegramConfigured(): boolean {
  return Boolean(devToken());
}

export function devGroupChatId(): string | null {
  return process.env.TELEGRAM_DEV_CHAT_ID || null;
}

// Best-effort by contract: notification failures are logged, never thrown —
// a ticket move must not fail because Telegram is down.
export async function sendDevMessage(chatId: string | number, text: string): Promise<boolean> {
  const t = devToken();
  if (!t) return false;
  try {
    const res = await fetch(`${API_BASE}/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok && /can't parse entities|unsupported start tag/i.test(data.description ?? "")) {
      const plain = text.replace(/<[^>]+>/g, "");
      const retry = await fetch(`${API_BASE}/bot${t}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: plain }),
      });
      return ((await retry.json()) as { ok: boolean }).ok;
    }
    return data.ok;
  } catch (e) {
    console.error("dev telegram send failed", e);
    return false;
  }
}
