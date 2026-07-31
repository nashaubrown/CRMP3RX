import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { sendDueMeetingReminders } from "@/services/scheduling";

// Reminds meetings starting within the next hour exactly once. Uses its own
// host + meetings so it doesn't depend on seed data.

const suffix = `rem-${Math.random().toString(36).slice(2, 8)}`;
let hostId: string;
let soonId: string;
let laterId: string;

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: "Reminder Host", email: `host-${suffix}@test.mv`, role: "SALES_REP" },
  });
  hostId = host.id;

  const now = Date.now();
  const soon = await db.meeting.create({
    data: {
      hostUserId: hostId,
      title: "Soon meeting",
      bookerName: "Merchant A",
      bookerEmail: `a-${suffix}@test.mv`,
      startAt: new Date(now + 30 * 60 * 1000), // 30 min out — within the hour
      endAt: new Date(now + 60 * 60 * 1000),
    },
  });
  soonId = soon.id;

  const later = await db.meeting.create({
    data: {
      hostUserId: hostId,
      title: "Later meeting",
      bookerName: "Merchant B",
      bookerEmail: `b-${suffix}@test.mv`,
      startAt: new Date(now + 3 * 60 * 60 * 1000), // 3h out — not yet
      endAt: new Date(now + 3.5 * 60 * 60 * 1000),
    },
  });
  laterId = later.id;
});

afterAll(async () => {
  await db.emailMessage.deleteMany({ where: { sentById: hostId } });
  await db.smsMessage.deleteMany({ where: { sentById: hostId } });
  await db.meeting.deleteMany({ where: { hostUserId: hostId } });
  await db.user.delete({ where: { id: hostId } });
});

describe("sendDueMeetingReminders", () => {
  it("reminds meetings within the next hour, and only those", async () => {
    const result = await sendDueMeetingReminders();
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const soon = await db.meeting.findUnique({ where: { id: soonId } });
    const later = await db.meeting.findUnique({ where: { id: laterId } });
    expect(soon?.reminderSentAt).not.toBeNull();
    expect(later?.reminderSentAt).toBeNull();
  });

  it("does not re-send a reminder already sent", async () => {
    const before = (await db.meeting.findUnique({ where: { id: soonId } }))?.reminderSentAt;
    expect(before).toBeTruthy();

    await sendDueMeetingReminders();

    const after = (await db.meeting.findUnique({ where: { id: soonId } }))?.reminderSentAt;
    expect(after?.getTime()).toBe(before?.getTime());
  });
});
