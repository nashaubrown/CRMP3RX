import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, PlusIcon } from "lucide-react";

import { ChatPanel, type ChatMessageView } from "@/components/assistant/chat-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/rbac";
import {
  assistantConfigured,
  getConversationMessages,
  listConversations,
} from "@/services/assistant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ask Perx" };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser();
  const { c: selectedId } = await searchParams;

  const conversations = await listConversations(user);
  const selected = selectedId ? await getConversationMessages(user, selectedId) : null;
  const configured = await assistantConfigured();

  const initialMessages: ChatMessageView[] =
    selected?.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: (m.toolCalls as { tool: string }[] | null) ?? undefined,
    })) ?? [];

  return (
    <div className="flex h-[calc(100svh-8.5rem)] flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ask Perx</h1>
          <p className="text-muted-foreground text-sm">
            Read-only AI assistant over your CRM data — every tool call is audit-logged
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/assistant">
            <PlusIcon /> New chat
          </Link>
        </Button>
      </div>

      {!configured ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>
            Set <code>ANTHROPIC_API_KEY</code> in <code>.env</code> — or use a free provider by
            setting <code>AI_PROVIDER</code> (GROQ, GEMINI, OPENROUTER, MISTRAL, OLLAMA) with
            its API key (see <code>.env.example</code>) — then restart the server.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="hidden flex-col gap-1 overflow-y-auto p-2 lg:flex">
          {conversations.length === 0 ? (
            <p className="text-muted-foreground p-2 text-sm">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/assistant?c=${conversation.id}`}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm transition-colors",
                  conversation.id === selectedId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
              >
                <span className="line-clamp-1">{conversation.title}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(conversation.updatedAt, "d MMM, HH:mm")}
                </span>
              </Link>
            ))
          )}
        </Card>

        <Card className="min-h-0 gap-0 overflow-hidden p-0">
          <ChatPanel
            key={selectedId ?? "new"}
            conversationId={selectedId ?? null}
            initialMessages={initialMessages}
          />
        </Card>
      </div>
    </div>
  );
}
