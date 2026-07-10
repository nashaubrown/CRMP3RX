import crypto from "node:crypto";

import { NextResponse } from "next/server";
import type { SmsStatus } from "@prisma/client";

import { db } from "@/lib/db";

// Twilio webhooks: outbound status callbacks AND inbound messages (STOP).
// Configure the messaging webhook + status callback to <app-url>/api/webhooks/twilio

const STATUS_MAP: Record<string, SmsStatus> = {
  queued: "QUEUED",
  sent: "SENT",
  delivered: "DELIVERED",
  undelivered: "FAILED",
  failed: "FAILED",
};

function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true; // dev without credentials: skip verification
  // With a token configured, a missing signature must fail — otherwise
  // anyone could forge opt-outs/status updates by omitting the header.
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", token).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  const signature = request.headers.get("x-twilio-signature");
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/twilio`;
  if (!verifyTwilioSignature(url, params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Inbound message → STOP/START keyword handling
  if (params.Body !== undefined && params.From) {
    const keyword = params.Body.trim().toUpperCase();
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "QUIT"].includes(keyword)) {
      await db.smsOptOut.upsert({
        where: { phone: params.From },
        create: { phone: params.From },
        update: {},
      });
    } else if (["START", "UNSTOP", "YES"].includes(keyword)) {
      await db.smsOptOut.deleteMany({ where: { phone: params.From } });
    }
    // Empty TwiML response (no auto-reply)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Outbound status callback
  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ? STATUS_MAP[params.MessageStatus] : undefined;
  if (sid && status) {
    await db.smsMessage.updateMany({
      where: { providerId: sid },
      data: {
        status,
        deliveredAt: status === "DELIVERED" ? new Date() : undefined,
        error: params.ErrorCode ? `Twilio error ${params.ErrorCode}` : undefined,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
