import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";

// Every service function takes this ctx and scopes its queries with it.
export type SessionUser = {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
};

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

export function isAdmin(user: SessionUser): boolean {
  return user.role === "ADMIN";
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");
  return user;
}

// Prisma where-fragment for owner scoping: admins see everything,
// sales reps only their own records.
export function ownerScope(user: SessionUser): { ownerId?: string } {
  return isAdmin(user) ? {} : { ownerId: user.id };
}
