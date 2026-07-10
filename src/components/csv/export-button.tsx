import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Plain download link — the export route reuses the session cookie.
export function ExportButton({
  entity,
  filters,
}: {
  entity: "merchants" | "contacts" | "deals" | "leads";
  filters: Record<string, string | undefined>;
}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter((kv): kv is [string, string] => Boolean(kv[1]))
  ).toString();

  return (
    <Button variant="outline" size="sm" asChild>
      <a href={`/api/export/${entity}${qs ? `?${qs}` : ""}`} download>
        <DownloadIcon /> Export CSV
      </a>
    </Button>
  );
}
