import { describe, expect, it } from "vitest";

import type { SessionUser } from "@/lib/authz";
import { answerAssistantQuestion } from "@/services/assistant";

// The Telegram bot's /ask path calls this. Without an AI provider configured
// (as in CI) it should return a graceful message rather than throw.

describe("answerAssistantQuestion", () => {
  it("returns a string and never throws when unconfigured", async () => {
    const ctx: SessionUser = { id: "ask-test", role: "ADMIN", name: "T", email: "t@test.mv" };
    const answer = await answerAssistantQuestion(ctx, "which merchants are active?");
    expect(typeof answer).toBe("string");
    expect(answer.length).toBeGreaterThan(0);
  });
});
