import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/authz";
import { requireUserOrThrow } from "@/lib/rbac";
import { setWebhook, telegramConfigured } from "@/integrations/telegram/client";

export const dynamic = "force-dynamic";

// Admin-only convenience endpoint: visit it once (while signed in as an admin)
// to register the Telegram webhook against this deployment. Requires
// TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET to be set.
export async function GET(req: Request) {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!telegramConfigured()) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not set" }, { status: 400 });
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET is not set" }, { status: 400 });
  }
  // Telegram restricts the secret token to these characters.
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    return NextResponse.json(
      {
        error:
          "TELEGRAM_WEBHOOK_SECRET must be 1–256 characters using only letters, digits, underscore (_) or hyphen (-). Update it in Vercel, redeploy, and try again.",
      },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  try {
    await setWebhook(webhookUrl, secret);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "setWebhook failed" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, webhook: webhookUrl });
}
