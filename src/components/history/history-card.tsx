"use client";

import * as React from "react";
import { HistoryIcon } from "lucide-react";

import type { HistoryEvent } from "@/lib/audit-events";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

const CATEGORY_LABELS: Record<HistoryEvent["category"], string> = {
  record: "Field changes",
  contacts: "Contacts",
  sharing: "Sharing",
  activity: "Activity log",
};

// Serialized event (dates arrive as strings across the RSC boundary).
export type SerializedHistoryEvent = Omit<HistoryEvent, "createdAt"> & {
  createdAt: string;
  when: string; // pre-formatted in MV time on the server
};

export function HistoryCard({
  events,
  title = "History",
  description,
}: {
  events: SerializedHistoryEvent[];
  title?: string;
  description?: string;
}) {
  const [actor, setActor] = React.useState(ALL);
  const [category, setCategory] = React.useState(ALL);

  const actors = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) if (e.actorId) seen.set(e.actorId, e.actorName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [events]);

  const filtered = events.filter(
    (e) =>
      (actor === ALL || e.actorId === actor) && (category === ALL || e.category === category)
  );

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="size-4" /> {title}
          </CardTitle>
          <div className="flex gap-2">
            {actors.length > 1 ? (
              <Select value={actor} onValueChange={setActor}>
                <SelectTrigger size="sm" aria-label="Filter by person">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everyone</SelectItem>
                  {actors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger size="sm" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No history entries match.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {filtered.map((event) => (
              <li key={event.id} className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span>
                    <span className="font-medium">{event.actorName}</span> {event.title}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {CATEGORY_LABELS[event.category]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{event.when}</span>
                </div>
                {event.changes.length > 0 ? (
                  <ul className="text-muted-foreground ml-4 flex list-disc flex-col gap-0.5 text-xs">
                    {event.changes.map((c) => (
                      <li key={c.field}>
                        <span className="text-foreground/80">{c.field}</span>: {c.from} →{" "}
                        {c.to}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
