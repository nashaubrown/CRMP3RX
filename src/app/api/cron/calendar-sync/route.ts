import { NextResponse } from "next/server";

import { syncAllCalendars } from "@/services/calendar-sync";

export const dynamic = "force-dynamic";
// Google's incremental sync is cheap, but a first full pull for several users
// can take a moment.
export const maxDuration = 60;

// Pulls every connected Google Calendar into the CRM. Vercel Cron hits this
// every 15 minutes (see vercel.json); the same Bearer secret lets you trigger
// it by hand when testing.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncAllCalendars();
  return NextResponse.json({ ok: true, ...result });
}
