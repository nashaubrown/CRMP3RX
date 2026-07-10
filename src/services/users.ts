import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";

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
