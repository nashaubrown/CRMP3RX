import { NextResponse } from "next/server";

import { sendDueMeetingReminders } from "@/services/scheduling";

export const dynamic = "force-dynamic";

// Meeting reminders cron. Vercel Cron hits this on a schedule (see vercel.json).
// When CRON_SECRET is set, Vercel sends it as a Bearer token and we require it;
// this also lets you trigger the job manually with the same header.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueMeetingReminders();
  return NextResponse.json({ ok: true, ...result });
}
