import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { handleTelegramUpdate, type TelegramUpdate } from "@/services/telegram";

// In a team group the bot is a participant, not the audience: it must stay
// silent unless it was addressed (command, @mention, or a reply to itself).
// These assert on the Telegram API calls the bot actually makes, so "stays
// quiet" is verified rather than assumed.

const BOT_ID = 4242;
const BOT_NAME = "PerxCRMBot";
const GROUP = { id: -100123, type: "supergroup" as const };
const HUMAN = { id: 7, first_name: "Nashau", is_bot: false };

let calls: { method: string; body: Record<string, unknown> }[] = [];

function stubTelegram() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      const method = String(url).split("/").pop() ?? "";
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      calls.push({ method, body });
      const result =
        method === "getMe" ? { id: BOT_ID, username: BOT_NAME } : { message_id: 1 };
      return { json: async () => ({ ok: true, result }) } as unknown as Response;
    })
  );
}

const sent = () => calls.filter((c) => c.method === "sendMessage");

const groupMessage = (text: string, extra: Record<string, unknown> = {}): TelegramUpdate => ({
  message: { message_id: 1, chat: GROUP, from: HUMAN, text, ...extra },
});

beforeAll(() => {
  process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
});

beforeEach(() => {
  calls = [];
  stubTelegram();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("telegram bot addressing", () => {
  it("ignores ordinary group chatter", async () => {
    await handleTelegramUpdate(groupMessage("ok sounds good, see you then"));
    expect(sent()).toHaveLength(0);
  });

  it("ignores chatter that merely mentions a keyword", async () => {
    // Previously "sync"/"call"/"meeting" alone woke the bot up.
    await handleTelegramUpdate(groupMessage("lets sync tomorrow after the client call"));
    expect(sent()).toHaveLength(0);
  });

  it("ignores an unaddressed question between colleagues", async () => {
    // Previously any message ending in "?" was answered.
    await handleTelegramUpdate(groupMessage("are you coming to the office today?"));
    expect(sent()).toHaveLength(0);
  });

  it("replies when @mentioned", async () => {
    await handleTelegramUpdate(groupMessage(`@${BOT_NAME} hello there`));
    expect(sent()).toHaveLength(1);
  });

  it("replies to a mention placed mid-sentence", async () => {
    await handleTelegramUpdate(groupMessage(`thanks @${BOT_NAME} hello`));
    expect(sent()).toHaveLength(1);
  });

  it("replies when someone replies to one of its own messages", async () => {
    await handleTelegramUpdate(
      groupMessage("hello", {
        reply_to_message: { message_id: 9, from: { id: BOT_ID, is_bot: true } },
      })
    );
    expect(sent()).toHaveLength(1);
  });

  it("ignores a reply to another person's message", async () => {
    await handleTelegramUpdate(
      groupMessage("hello", {
        reply_to_message: { message_id: 9, from: { id: 55, is_bot: false } },
      })
    );
    expect(sent()).toHaveLength(0);
  });

  it("still answers slash commands with no mention", async () => {
    await handleTelegramUpdate(groupMessage("/help"));
    expect(sent()).toHaveLength(1);
  });

  it("ignores a command aimed at a different bot", async () => {
    await handleTelegramUpdate(groupMessage("/help@SomeOtherBot"));
    expect(sent()).toHaveLength(0);
  });

  it("answers a command explicitly aimed at it", async () => {
    await handleTelegramUpdate(groupMessage(`/help@${BOT_NAME}`));
    expect(sent()).toHaveLength(1);
  });

  it("responds to everything in a private chat", async () => {
    await handleTelegramUpdate({
      message: { message_id: 1, chat: { id: 7, type: "private" }, from: HUMAN, text: "hello" },
    });
    expect(sent()).toHaveLength(1);
  });

  it("nudges instead of going silent on a bare mention", async () => {
    await handleTelegramUpdate(groupMessage(`@${BOT_NAME}`));
    expect(sent()).toHaveLength(1);
    expect(String(sent()[0].body.text)).toMatch(/help/i);
  });
});
