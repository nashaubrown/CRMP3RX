import { NextResponse } from "next/server";

import { purgeExpiredRegistrationData } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Retention cron for affiliate registration data: abandoned drafts purge
// whole after 7 days; rejected applications lose their ID document and
// signature files after 30 days. Same auth convention as the reminders cron.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await purgeExpiredRegistrationData();
  return NextResponse.json({ ok: true, ...result });
}
