import crypto from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GOOGLE_CALENDAR_SCOPES } from "@/integrations/calendar/google";
import { getSessionUser } from "@/lib/rbac";

// Starts the Google Calendar consent flow (separate from Google sign-in:
// calendar needs offline access + calendar scopes).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(new URL("/settings?calendar=not-configured", request.url));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${appUrl}/api/google/callback`,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent", // always return a refresh_token
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
