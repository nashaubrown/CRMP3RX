import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/authz";
import { db } from "@/lib/db";

// Session-reading helpers (framework-coupled). Pure authorization logic
// lives in @/lib/authz so services and tests don't pull in next-auth.
export { isAdmin, ownerScope, type SessionUser } from "@/lib/authz";

// Presence ("last seen") stamping. lastLoginAt only moves at the login form,
// which under-reports anyone riding a 30-day session cookie — someone can
// browse daily and show "never signed in". So every authenticated session
// read bumps lastSeenAt, throttled to one write per user per window.
//
// The in-process map skips the DB round-trip for hot requests; the WHERE
// clause enforces the same window against the database, so multiple server
// instances don't multiply writes. Fire-and-forget: presence must never add
// latency or failure to the request that carried it.
const SEEN_THROTTLE_MS = 5 * 60 * 1000;
const seenStamped = new Map<string, number>();

function stampSeen(userId: string) {
  const now = Date.now();
  const last = seenStamped.get(userId);
  if (last && now - last < SEEN_THROTTLE_MS) return;
  seenStamped.set(userId, now);
  db.user
    .updateMany({
      where: {
        id: userId,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now - SEEN_THROTTLE_MS) } }],
      },
      data: { lastSeenAt: new Date(now) },
    })
    .catch(() => undefined);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  stampSeen(session.user.id);
  return {
    id: session.user.id,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };
}

// For pages/layouts: redirects to login when unauthenticated.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// For server actions / route handlers: throws instead of redirecting.
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
