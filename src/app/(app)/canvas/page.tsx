import type { Metadata } from "next";
import Link from "next/link";
import { SparklesIcon, WandSparklesIcon } from "lucide-react";

import { CanvasClient } from "@/components/generative/canvas-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/rbac";
import { aiConfigured } from "@/integrations/ai";
import { getCanvasView, listCanvasViews } from "@/services/canvas";

export const metadata: Metadata = { title: "Canvas" };

export default async function CanvasPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await requireUser();
  const { v } = await searchParams;

  const [history, opened] = await Promise.all([
    listCanvasViews(user),
    v ? getCanvasView(user, v) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <WandSparklesIcon className="text-primary size-5" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Generative canvas</h1>
          <p className="text-muted-foreground text-sm">
            Describe what you want to see — the AI composes a live view from your CRM data
          </p>
        </div>
      </div>

      {!aiConfigured() ? (
        <Alert variant="destructive">
          <AlertDescription>
            Generative UI isn&apos;t configured — set <code>ANTHROPIC_API_KEY</code> (or a free
            provider via <code>AI_PROVIDER</code>) in <code>.env</code>, then restart.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 gap-4 lg:grid-cols-[1fr_15rem]">
        <div className="min-w-0">
          <CanvasClient initialView={opened?.view ?? null} initialPrompt={opened?.prompt} />
        </div>

        <Card className="hidden h-fit lg:block">
          <CardContent className="flex flex-col gap-1 p-2">
            <p className="text-muted-foreground px-2 py-1 text-xs font-medium">Recent views</p>
            {history.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1 text-sm">Nothing yet.</p>
            ) : (
              history.map((h) => (
                <Link
                  key={h.id}
                  href={`/canvas?v=${h.id}`}
                  className="hover:bg-muted/60 flex flex-col rounded-md px-2 py-1.5"
                >
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <SparklesIcon className="size-3 shrink-0" /> {h.title}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {formatDateTime(h.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
