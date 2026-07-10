import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/authz";

// Session-reading helpers (framework-coupled). Pure authorization logic
// lives in @/lib/authz so services and tests don't pull in next-auth.
export { isAdmin, ownerScope, type SessionUser } from "@/lib/authz";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
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
