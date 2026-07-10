import type { Role } from "@prisma/client";

// Pure authorization helpers — no next-auth import, so the services layer
// (and its tests) stay decoupled from the web framework.

export type SessionUser = {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
};

export function isAdmin(user: SessionUser): boolean {
  return user.role === "ADMIN";
}

// Prisma where-fragment for owner scoping: admins see everything,
// sales reps only their own records.
export function ownerScope(user: SessionUser): { ownerId?: string } {
  return isAdmin(user) ? {} : { ownerId: user.id };
}
