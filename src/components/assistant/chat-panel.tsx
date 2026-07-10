"use client";

import * as React from "react";
import { Loader2Icon, SendIcon, SparklesIcon, WrenchIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatMessageView = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls?: { tool: string }[] | null;
};

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

// Client-local message ids (avoids Date.now() which the purity lint flags)
let messageCounter = 0;

const SUGGESTIONS = [
  "Summarize my pipeline",
  "What's on my plate today?",
  "Which deals are closing this month?",
  "Who haven't I followed up with in 2 weeks?",
];

export function ChatPanel({
  conversationId: initialConversationId,
  initialMessages,
  onConversationChange,
}: {
  conversationId?: string | null;
  initialMessages?: ChatMessageView[];
  onConversationChange?: (id: string) => void;
}) {
  const [conversationId, setConversationId] = React.useState<string | null>(
    initialConversationId ?? null
  );
  const [messages, setMessages] = React.useState<ChatMessageView[]>(initialMessages ?? []);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, activeTool]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError(null);
    setInput("");
    setStreaming(true);
    const turn = ++messageCounter;
    const userMsg: ChatMessageView = { id: `u-${turn}`, role: "USER", content: trimmed };
    const assistantId = `a-${turn}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "ASSISTANT", content: "" },
    ]);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: trimmed }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Request failed (${response.status})`);
      }

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
            id?: string;
            text?: string;
            name?: string;
            message?: string;
          };
          if (event.type === "conversation" && event.id) {
            setConversationId(event.id);
            onConversationChange?.(event.id);
          } else if (event.type === "delta" && event.text) {
            setActiveTool(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.text } : m
              )
            );
          } else if (event.type === "tool" && event.name) {
            setActiveTool(event.name);
          } else if (event.type === "error") {
            setError(event.message ?? "Something went wrong");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setStreaming(false);
      setActiveTool(null);
      // Drop an empty assistant bubble if nothing streamed
      setMessages((prev) => prev.filter((m) => !(m.id === assistantId && m.content === "")));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <SparklesIcon className="text-muted-foreground size-8" />
            <div>
              <p className="font-medium">Ask Perx</p>
              <p className="text-muted-foreground text-sm">
                Questions about your merchants, deals, tasks and comms — grounded in live CRM
                data, read-only.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === "USER"
                    ? "bg-primary text-primary-foreground self-end"
                    : "bg-muted self-start"
                )}
              >
                {message.content || (streaming ? "…" : "")}
                {message.role === "ASSISTANT" && message.toolCalls?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {[...new Set(message.toolCalls.map((t) => t.tool))].map((tool) => (
                      <Badge key={tool} variant="outline" className="text-[10px]">
                        <WrenchIcon className="size-2.5" />
                        {TOOL_LABELS[tool] ?? tool}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {activeTool ? (
              <div className="text-muted-foreground flex items-center gap-2 self-start text-xs">
                <Loader2Icon className="size-3 animate-spin" />
                {TOOL_LABELS[activeTool] ?? activeTool}…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error ? (
        <Alert variant="destructive" className="mx-4 mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about your merchants, deals, tasks…"
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none"
          disabled={streaming}
        />
        <Button
          size="icon"
          onClick={() => send(input)}
          disabled={streaming || !input.trim()}
          aria-label="Send"
        >
          {streaming ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        </Button>
      </div>
    </div>
  );
}
