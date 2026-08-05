import { hash } from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";

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

// --- Admin team management ---------------------------------------------------
// Create teammates, change roles, reset passwords, and offboard (disable)
// accounts. Every mutation is gated on the caller being an admin, and guarded
// so the org can never lock itself out of all admins.

export class TeamError extends Error {}

function assertAdmin(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new TeamError("Only admins can manage the team.");
}

export const createTeamUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["ADMIN", "SALES_REP"]),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const setRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "SALES_REP"]),
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const setDisabledSchema = z.object({
  userId: z.string().min(1),
  disabled: z.boolean(),
});

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  disabledAt: Date | null;
  createdAt: Date;
  isSelf: boolean;
  hasPassword: boolean;
  ownedMerchants: number;
  ownedDeals: number;
};

export async function listTeam(ctx: SessionUser): Promise<TeamMember[]> {
  assertAdmin(ctx);
  const users = await db.user.findMany({
    orderBy: [{ disabledAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      disabledAt: true,
      createdAt: true,
      passwordHash: true,
      _count: { select: { ownedMerchants: true, ownedDeals: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    disabledAt: u.disabledAt,
    createdAt: u.createdAt,
    isSelf: u.id === ctx.id,
    hasPassword: Boolean(u.passwordHash),
    ownedMerchants: u._count.ownedMerchants,
    ownedDeals: u._count.ownedDeals,
  }));
}

// Number of admins who can still sign in — used to block the last-admin lockout.
async function activeAdminCount(): Promise<number> {
  return db.user.count({ where: { role: "ADMIN", disabledAt: null } });
}

export async function createTeamUser(
  ctx: SessionUser,
  input: z.infer<typeof createTeamUserSchema>
): Promise<TeamMember> {
  assertAdmin(ctx);
  const { name, email, role, password } = createTeamUserSchema.parse(input);

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new TeamError("A user with that email already exists.");

  const passwordHash = await hash(password, 10);
  const u = await db.user.create({
    data: { name, email, role, passwordHash },
    select: { id: true, name: true, email: true, role: true, disabledAt: true, createdAt: true },
  });
  return {
    ...u,
    isSelf: false,
    hasPassword: true,
    ownedMerchants: 0,
    ownedDeals: 0,
  };
}

export async function setTeamRole(
  ctx: SessionUser,
  input: z.infer<typeof setRoleSchema>
): Promise<void> {
  assertAdmin(ctx);
  const { userId, role } = setRoleSchema.parse(input);

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, disabledAt: true },
  });
  if (!target) throw new TeamError("User not found.");
  await assertMayActOnAdmin(ctx, userId);

  // Prevent demoting the last remaining active admin (including yourself).
  if (target.role === "ADMIN" && role !== "ADMIN" && !target.disabledAt) {
    if ((await activeAdminCount()) <= 1) {
      throw new TeamError("You can't remove the last admin. Promote someone else first.");
    }
  }
  await db.user.update({ where: { id: userId }, data: { role } });
}


// Acting on another ADMIN — resetting their password, disabling them, or
// changing their role — is an account-takeover vector: one compromised admin
// session shouldn't be able to lock out or impersonate the rest. Only the
// owner account may do it. Acting on yourself is always allowed, and admins
// keep full control over sales reps.
async function assertMayActOnAdmin(ctx: SessionUser, targetId: string): Promise<void> {
  if (targetId === ctx.id) return;
  const [target, actor] = await Promise.all([
    db.user.findUnique({ where: { id: targetId }, select: { role: true } }),
    db.user.findUnique({ where: { id: ctx.id }, select: { isOwner: true } }),
  ]);
  if (!target) throw new TeamError("User not found.");
  if (target.role !== "ADMIN") return; // reps are fair game for any admin
  if (!actor?.isOwner) {
    throw new TeamError(
      "Only the owner account can change another admin. Ask them, or have that admin sign in and change it themselves."
    );
  }
}

export async function resetTeamPassword(
  ctx: SessionUser,
  input: z.infer<typeof resetPasswordSchema>
): Promise<void> {
  assertAdmin(ctx);
  const { userId, password } = resetPasswordSchema.parse(input);
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) throw new TeamError("User not found.");
  await assertMayActOnAdmin(ctx, userId);
  const passwordHash = await hash(password, 10);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function setTeamDisabled(
  ctx: SessionUser,
  input: z.infer<typeof setDisabledSchema>
): Promise<void> {
  assertAdmin(ctx);
  const { userId, disabled } = setDisabledSchema.parse(input);

  if (userId === ctx.id && disabled) {
    throw new TeamError("You can't disable your own account.");
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, disabledAt: true },
  });
  if (!target) throw new TeamError("User not found.");
  await assertMayActOnAdmin(ctx, userId);

  // Blocking the last active admin would lock everyone out of team management.
  if (disabled && target.role === "ADMIN" && !target.disabledAt) {
    if ((await activeAdminCount()) <= 1) {
      throw new TeamError("You can't disable the last admin.");
    }
  }
  await db.user.update({
    where: { id: userId },
    // Timestamp-based so re-enabling clears it cleanly.
    data: { disabledAt: disabled ? new Date() : null },
  });
}
