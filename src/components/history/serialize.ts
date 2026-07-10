import type { SerializedHistoryEvent } from "@/components/history/history-card";
import type { HistoryEvent } from "@/lib/audit-events";
import { formatDateTime } from "@/lib/datetime";

export function serializeEvents(events: HistoryEvent[]): SerializedHistoryEvent[] {
  return events.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    when: formatDateTime(e.createdAt),
  }));
}
