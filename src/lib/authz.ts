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

// Team-wide edit policy.
//
// Perx runs as one small sales team who cover for each other, so any signed-in
// user may edit any merchant, contact, lead or deal — ownership is no longer
// an edit boundary. It still drives "mine" list filters, dashboard counts and
// per-rep reporting, so nothing about attribution changes.
//
// Deliberately NOT widened: deleting records, managing shares, viewing change
// history, and the admin-only surfaces (team, AI/email settings, affiliate
// payouts). Those stay with the owner or an admin, because they're the actions
// you can't undo by just typing the value back in.
export function canEditAnyRecord(user: SessionUser): boolean {
  return Boolean(user?.id);
}

// Prisma where-fragment for owner scoping: admins see everything,
// sales reps only their own records.
export function ownerScope(user: SessionUser): { ownerId?: string } {
  return isAdmin(user) ? {} : { ownerId: user.id };
}
