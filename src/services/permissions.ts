import { db } from "@/lib/db";
import { isAdmin, type SessionUser } from "@/lib/authz";

// Capability resolution. Every access decision that isn't simply "admin?"
// comes through here, so there is one place to read and one place to change.
//
// Resolution order for a sales rep:
//   1. the permission set assigned to them
//   2. the set flagged isDefault
//   3. FALLBACK below (used when the table is empty or unreachable)
//
// Admins are never restricted — they hold every capability by definition.

export type Capabilities = {
  /** Bulk-download lists as CSV. */
  canExportData: boolean;
  /** See merchants owned by other reps (and their contacts, deals, activity). */
  canSeeAllMerchants: boolean;
  /** See team-wide totals and the per-rep breakdown on the dashboard. */
  canSeeTeamNumbers: boolean;
};

export const ADMIN_CAPABILITIES: Capabilities = {
  canExportData: true,
  canSeeAllMerchants: true,
  canSeeTeamNumbers: true,
};

// Used only when no permission set exists at all. Deliberately matches the
// pre-permissions behaviour except for export, which was never gated and is
// the thing this system exists to close.
const FALLBACK: Capabilities = {
  canExportData: false,
  canSeeAllMerchants: true,
  canSeeTeamNumbers: true,
};

export async function getCapabilities(ctx: SessionUser): Promise<Capabilities> {
  if (isAdmin(ctx)) return ADMIN_CAPABILITIES;

  try {
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: {
        permissionSet: {
          select: { canExportData: true, canSeeAllMerchants: true, canSeeTeamNumbers: true },
        },
      },
    });
    if (user?.permissionSet) return user.permissionSet;

    const fallbackSet = await db.permissionSet.findFirst({
      where: { isDefault: true },
      select: { canExportData: true, canSeeAllMerchants: true, canSeeTeamNumbers: true },
    });
    return fallbackSet ?? FALLBACK;
  } catch {
    // e.g. table not migrated yet — never let a lookup failure open access up.
    return FALLBACK;
  }
}

export class PermissionError extends Error {}

export async function assertCapability(
  ctx: SessionUser,
  capability: keyof Capabilities,
  message: string
): Promise<void> {
  const caps = await getCapabilities(ctx);
  if (!caps[capability]) throw new PermissionError(message);
}

// ---- admin management -------------------------------------------------------

export async function listPermissionSets(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new PermissionError("Only admins can manage permission sets.");
  return db.permissionSet.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });
}

export type PermissionSetInput = {
  name: string;
  description?: string | null;
  canExportData: boolean;
  canSeeAllMerchants: boolean;
  canSeeTeamNumbers: boolean;
};

export async function savePermissionSet(
  ctx: SessionUser,
  id: string | null,
  input: PermissionSetInput
) {
  if (!isAdmin(ctx)) throw new PermissionError("Only admins can manage permission sets.");
  const name = input.name.trim();
  if (!name) throw new PermissionError("Give the permission set a name.");

  const data = {
    name,
    description: input.description?.trim() || null,
    canExportData: input.canExportData,
    canSeeAllMerchants: input.canSeeAllMerchants,
    canSeeTeamNumbers: input.canSeeTeamNumbers,
  };

  if (id) return db.permissionSet.update({ where: { id }, data });
  return db.permissionSet.create({ data });
}

export async function deletePermissionSet(ctx: SessionUser, id: string) {
  if (!isAdmin(ctx)) throw new PermissionError("Only admins can manage permission sets.");
  const set = await db.permissionSet.findUnique({
    where: { id },
    select: { isDefault: true },
  });
  if (!set) throw new PermissionError("Permission set not found.");
  if (set.isDefault) {
    throw new PermissionError(
      "That's the default set — make another one the default before deleting it."
    );
  }
  // Users pointing at it fall back to the default (onDelete: SetNull).
  await db.permissionSet.delete({ where: { id } });
}

export async function setDefaultPermissionSet(ctx: SessionUser, id: string) {
  if (!isAdmin(ctx)) throw new PermissionError("Only admins can manage permission sets.");
  await db.$transaction([
    db.permissionSet.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    db.permissionSet.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

export async function assignPermissionSet(
  ctx: SessionUser,
  userId: string,
  permissionSetId: string | null
) {
  if (!isAdmin(ctx)) throw new PermissionError("Only admins can assign permission sets.");
  await db.user.update({ where: { id: userId }, data: { permissionSetId } });
}
