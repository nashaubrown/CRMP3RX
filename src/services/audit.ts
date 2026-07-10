import { db } from "@/lib/db";

type AuditInput = {
  actorId: string | null;
  action: string; // e.g. "merchant.create", "contact.delete", "assistant.tool_call"
  entityType: string;
  entityId: string;
  diff?: unknown;
};

// Shallow before/after diff of changed fields, for update audit entries.
export function shallowDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    const a = from instanceof Date ? from.toISOString() : from;
    const b = to instanceof Date ? to.toISOString() : to;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diff[key] = { from: a, to: b };
    }
  }
  return diff;
}

export async function audit({ actorId, action, entityType, entityId, diff }: AuditInput) {
  await db.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      diff: diff === undefined ? undefined : JSON.parse(JSON.stringify(diff)),
    },
  });
}
