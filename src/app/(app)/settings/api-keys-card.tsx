"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { createApiKeyAction, revokeApiKeyAction } from "@/app/(app)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}

export function ApiKeysCard({ keys, appUrl }: { keys: KeyRow[]; appUrl: string }) {
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState("");
  const [newToken, setNewToken] = React.useState<string | null>(null);

  const mcpUrl = `${appUrl}/api/mcp`;

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createApiKeyAction(name);
      if (result.error) toast.error(result.error);
      else {
        setNewToken(result.token ?? null);
        setName("");
        toast.success("API key created — copy it now, it won't be shown again");
      }
    });
  }

  function onRevoke(id: string, keyName: string) {
    startTransition(async () => {
      const result = await revokeApiKeyAction(id);
      if (result.error) toast.error(result.error);
      else toast.success(`Revoked "${keyName}"`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRoundIcon className="size-4" /> API keys & Claude integration
        </CardTitle>
        <CardDescription>
          Keys act as you — same permissions as your login. Use them for the REST API (
          <code className="text-xs">{appUrl}/api/v1/…</code>) or to connect Claude to the CRM
          via MCP.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {newToken ? (
          <Alert>
            <AlertDescription className="w-full">
              <p className="mb-1 font-medium">
                Copy your new key now — it won&apos;t be shown again:
              </p>
              <span className="flex items-center gap-1">
                <code className="bg-muted block overflow-x-auto rounded px-2 py-1 text-xs">
                  {newToken}
                </code>
                <CopyButton value={newToken} label="API key" />
              </span>
            </AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onCreate} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Claude Desktop)"
            maxLength={60}
            required
            className="max-w-xs"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Create key
          </Button>
        </form>

        {keys.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            {keys.map((k) => (
              <div
                key={k.id}
                className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{k.name}</p>
                  <p className="text-muted-foreground text-xs">
                    <code>{k.prefix}…</code> · created {k.createdAt}
                    {k.lastUsedAt ? ` · last used ${k.lastUsedAt}` : " · never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-7"
                  aria-label={`Revoke ${k.name}`}
                  disabled={pending}
                  onClick={() => onRevoke(k.id, k.name)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No API keys yet.</p>
        )}

        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p className="font-medium">Connect Claude (MCP)</p>
          <div className="text-muted-foreground flex flex-col gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="shrink-0">Server URL:</span>
              <code className="bg-muted overflow-x-auto rounded px-1.5 py-0.5">{mcpUrl}</code>
              <CopyButton value={mcpUrl} label="MCP URL" />
            </span>
            <p>
              <strong>Claude Code:</strong>{" "}
              <code className="bg-muted rounded px-1.5 py-0.5">
                claude mcp add --transport http perx-crm {mcpUrl} --header
                &quot;Authorization: Bearer YOUR_KEY&quot;
              </code>
            </p>
            <p>
              <strong>claude.ai / Claude Desktop</strong> (Settings → Connectors → Add custom
              connector): use{" "}
              <code className="bg-muted rounded px-1.5 py-0.5">{mcpUrl}?key=YOUR_KEY</code> as
              the URL if you can&apos;t set headers.
            </p>
            <p>
              Claude gets search, merchant/contact/deal/pipeline lookups, plus log_activity and
              schedule_meeting — always limited to what your account can see and edit.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
