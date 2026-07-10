import { z } from "zod";

import { getSessionUser } from "@/lib/rbac";
import { runAssistantTurn } from "@/services/assistant";

const bodySchema = z.object({
  conversationId: z.string().nullable().optional(),
  message: z.string().trim().min(1).max(4000),
});

// SSE endpoint for Ask Perx. The Anthropic API key never leaves the server.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });

  const { conversationId, message } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAssistantTurn(user, conversationId ?? null, message)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: e instanceof Error ? e.message : "Stream failed" })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
