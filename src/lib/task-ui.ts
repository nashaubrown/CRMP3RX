import type { UiTask } from "@/components/tasks/task-dialog";
import { formatDateTime } from "@/lib/datetime";
import type { TaskItem } from "@/services/tasks";

// End of the current Maldives day (UTC+5) as a UTC instant.
function endOfMvDay(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(18, 59, 59, 999);
  return d;
}

function bucketOf(dueAt: Date | null, done: boolean, now: Date): UiTask["bucket"] {
  if (done) return "done";
  if (!dueAt) return "none";
  if (dueAt < now) return "overdue";
  if (dueAt <= endOfMvDay(now)) return "today";
  if (dueAt <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) return "week";
  return "later";
}

// Maldives wall-clock (UTC+5) as a datetime-local input value.
function toMvLocalInput(d: Date): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

// Serialize a service TaskItem into the client-facing UiTask (dates → strings,
// derived buckets/labels).
export function toUiTask(t: TaskItem, now: Date): UiTask {
  const done = t.completedAt !== null;
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    done,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName,
    link: t.link,
    merchantId: t.link?.kind === "merchant" ? t.link.href.split("/").pop()! : null,
    contactId: t.link?.kind === "contact" ? t.link.href.split("/").pop()! : null,
    dealId: t.link?.kind === "deal" ? t.link.href.split("/").pop()! : null,
    dueAtLocal: t.dueAt ? toMvLocalInput(t.dueAt) : null,
    dueLabel: t.dueAt ? formatDateTime(t.dueAt) : null,
    overdue: !done && t.dueAt !== null && t.dueAt < now,
    bucket: bucketOf(t.dueAt, done, now),
  };
}
