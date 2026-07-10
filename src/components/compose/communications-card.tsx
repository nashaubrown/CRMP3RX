import { MailIcon, MessageSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";

type CommItem = {
  id: string;
  channel: "EMAIL" | "SMS";
  to: string;
  summary: string;
  status: string;
  senderName: string;
  createdAt: Date;
};

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  QUEUED: "outline",
  SENT: "secondary",
  DELIVERED: "secondary",
  OPENED: "secondary",
  BOUNCED: "destructive",
  FAILED: "destructive",
};

export function CommunicationsCard({ items }: { items: CommItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Communications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {items.length === 0 ? (
          <p className="text-muted-foreground">Nothing sent yet.</p>
        ) : (
          items.map((item) => (
            <div key={`${item.channel}-${item.id}`} className="flex items-start gap-2">
              {item.channel === "EMAIL" ? (
                <MailIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              ) : (
                <MessageSquareIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.summary}</p>
                <p className="text-muted-foreground text-xs">
                  to {item.to} · {item.senderName} · {formatDateTime(item.createdAt)}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[item.status] ?? "outline"} className="capitalize">
                {item.status.toLowerCase()}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
