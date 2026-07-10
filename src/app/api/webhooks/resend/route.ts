import { NextResponse } from "next/server";
import type { EmailStatus } from "@prisma/client";
import { Webhook } from "svix";

import { db } from "@/lib/db";

// Resend delivery events (svix-signed when RESEND_WEBHOOK_SECRET is set).
// Configure the endpoint in the Resend dashboard: <app-url>/api/webhooks/resend

const EVENT_STATUS: Record<string, EmailStatus> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.opened": "OPENED",
  "email.bounced": "BOUNCED",
  "email.complained": "BOUNCED",
  "email.delivery_delayed": "SENT",
};

// Never regress a status (e.g. OPENED must not go back to DELIVERED).
const STATUS_RANK: Record<EmailStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  OPENED: 3,
  BOUNCED: 4,
  FAILED: 4,
};

export async function POST(request: Request) {
  const payload = await request.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  let event: { type?: string; data?: { email_id?: string } };
  if (secret) {
    try {
      const webhook = new Webhook(secret);
      event = webhook.verify(payload, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      }) as typeof event;
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // Dev without a secret: accept unsigned payloads.
    try {
      event = JSON.parse(payload);
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
  }

  const status = event.type ? EVENT_STATUS[event.type] : undefined;
  const providerId = event.data?.email_id;
  if (!status || !providerId) return NextResponse.json({ ok: true });

  const message = await db.emailMessage.findFirst({ where: { providerId } });
  if (message && STATUS_RANK[status] > STATUS_RANK[message.status]) {
    await db.emailMessage.update({
      where: { id: message.id },
      data: {
        status,
        deliveredAt: status === "DELIVERED" ? new Date() : message.deliveredAt,
        openedAt: status === "OPENED" ? new Date() : message.openedAt,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
