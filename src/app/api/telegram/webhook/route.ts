import { NextResponse } from "next/server";

import { telegramConfigured } from "@/integrations/telegram/client";
import { handleTelegramUpdate, type TelegramUpdate } from "@/services/telegram";

export const dynamic = "force-dynamic";

// Telegram posts updates here. We verify the secret token Telegram echoes back
// (set when registering the webhook) and always return 200 so Telegram doesn't
// retry-storm on a transient failure.
export async function POST(req: Request) {
  if (!telegramConfigured()) return NextResponse.json({ ok: true });

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await handleTelegramUpdate(update);
  } catch (e) {
    console.error("[telegram] update handling failed", e);
  }

  return NextResponse.json({ ok: true });
}
