import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/rbac";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings?calendar=error", request.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${appUrl}/api/google/callback`,
    }),
  });
  if (!tokenRes.ok) {
    console.error(`[google-calendar] code exchange failed: ${tokenRes.status}`);
    return NextResponse.redirect(new URL("/settings?calendar=error", request.url));
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  if (!tokens.refresh_token) {
    // Can happen if consent was previously granted without offline access
    return NextResponse.redirect(new URL("/settings?calendar=no-refresh-token", request.url));
  }

  await db.googleCalendarAccount.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
    },
  });

  return NextResponse.redirect(new URL("/settings?calendar=connected", request.url));
}
