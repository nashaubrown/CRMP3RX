import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";

// Teammate directory (internal tool: any signed-in user can see names).
// Used by the share dialog.
export async function listTeamMembers() {
  return db.user.findMany({
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

// For owner-assignment selects. Admin-only; reps assign to themselves.
export async function listAssignableUsers(ctx: SessionUser) {
  if (!isAdmin(ctx)) {
    return [{ id: ctx.id, name: ctx.name ?? "Me" }];
  }
  return db.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
