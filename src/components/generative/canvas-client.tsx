"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SparklesIcon, WandSparklesIcon } from "lucide-react";

import { GenerativeView } from "@/components/generative/generative-view";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ViewSpec } from "@/lib/validators/canvas";

const TOOL_LABELS: Record<string, string> = {
  search_records: "Searching records",
  get_merchant: "Reading merchant",
  get_contact: "Reading contact",
  list_deals: "Listing deals",
  pipeline_summary: "Summarizing pipeline",
  list_activities_due: "Checking your tasks",
  recent_communications: "Reading communications",
  stale_merchants: "Finding stale merchants",
};

const SUGGESTIONS = [
  "Summarize my pipeline as stat tiles and a chart",
  "Show my deals closing this month",
  "Which merchants haven't I followed up with in 2 weeks?",
  "Give me a snapshot of Island Bakery",
  "What's on my plate today?",
];

export function CanvasClient({
  initialView,
  initialPrompt,
}: {
  initialView?: ViewSpec | null;
  initialPrompt?: string;
}) {
  const router = useRouter();
  const [input, setInput] = React.useState(initialPrompt ?? "");
  const [view, setView] = React.useState<ViewSpec | null>(initialView ?? null);
  const [busy, setBusy] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function generate(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    setActiveTool(null);
    setView(null);

    try {
      const response = await fetch("/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      if (!response.ok || !response.body) throw new Error(`Request failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const event = JSON.parse(part.slice(6)) as {
            type: string;
            name?: string;
            view?: ViewSpec;
            message?: string;
          };
          if (event.type === "tool" && event.name) setActiveTool(event.name);
          else if (event.type === "view" && event.view) {
            setView(event.view);
            setActiveTool(null);
          } else if (event.type === "error") setError(event.message ?? "Something went wrong");
        }
      }
      // Refresh the history sidebar (server component) after a new view lands.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setActiveTool(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate(input);
        }}
        className="flex flex-col gap-2"
      >
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the view you want — e.g. “my pipeline as tiles and a chart, plus deals closing this month”"
            rows={2}
            className="pr-28"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void generate(input);
              }
            }}
          />
          <Button type="submit" size="sm" disabled={busy} className="absolute right-2 bottom-2">
            {busy ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
            Compose
          </Button>
        </div>
      </form>

      {!view && !busy ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => void generate(s)}>
              <SparklesIcon /> {s}
            </Button>
          ))}
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {busy ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {activeTool ? `${TOOL_LABELS[activeTool] ?? "Working"}…` : "Composing your view…"}
          </CardContent>
        </Card>
      ) : null}

      {view && !busy ? <GenerativeView spec={view} /> : null}
    </div>
  );
}
