import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createSharedMeeting, getTelegramMeetingHost } from "@/services/scheduling";
import { matchMerchant } from "@/services/telegram";

// Covers the non-AI, non-network parts of the Telegram meeting flow: merchant
// matching, the shared host resolver, and internal-block meeting creation.

const suffix = `tg-${Math.random().toString(36).slice(2, 8)}`;
let ownerId: string;
let merchantId: string;

beforeAll(async () => {
  const owner = await db.user.create({
    data: { name: "TG Owner", email: `owner-${suffix}@test.mv`, role: "SALES_REP" },
  });
  ownerId = owner.id;
  const merchant = await db.merchant.create({
    data: { name: `Ocean Bubbles ${suffix}`, ownerId },
  });
  merchantId = merchant.id;
});

afterAll(async () => {
  await db.activity.deleteMany({ where: { entityType: "MERCHANT", entityId: merchantId } });
  await db.meeting.deleteMany({ where: { hostUserId: ownerId } });
  await db.merchant.deleteMany({ where: { id: merchantId } });
  await db.user.deleteMany({ where: { id: ownerId } });
});

describe("matchMerchant", () => {
  it("finds a single merchant by partial, case-insensitive name", async () => {
    const res = await matchMerchant(`ocean bubbles ${suffix}`);
    expect(res.status).toBe("one");
    if (res.status === "one") expect(res.merchant.id).toBe(merchantId);
  });

  it("returns none when nothing matches", async () => {
    const res = await matchMerchant(`no-such-merchant-${suffix}`);
    expect(res.status).toBe("none");
  });
});

describe("getTelegramMeetingHost", () => {
  it("resolves a host (admin fallback exists in seed)", async () => {
    const host = await getTelegramMeetingHost();
    expect(host?.id).toBeTruthy();
  });
});

describe("createSharedMeeting", () => {
  it("creates an internal-block meeting and mirrors it onto the merchant timeline", async () => {
    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const meeting = await createSharedMeeting({
      hostUserId: ownerId,
      merchantId,
      merchantName: `Ocean Bubbles ${suffix}`,
      title: "Intro meeting",
      startAt,
      durationMins: 45,
      source: "Telegram",
    });

    expect(meeting.bookerEmail).toBe(""); // internal block, no external attendee
    expect(meeting.endAt.getTime() - meeting.startAt.getTime()).toBe(45 * 60 * 1000);

    const activity = await db.activity.findFirst({
      where: { meetingId: meeting.id, entityType: "MERCHANT", entityId: merchantId },
    });
    expect(activity?.type).toBe("MEETING");
  });
});
