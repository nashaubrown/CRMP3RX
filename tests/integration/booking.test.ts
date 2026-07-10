import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { bookMeeting, getAvailableSlots } from "@/services/scheduling";

// Books a real slot against the seeded availability, then verifies the slot
// disappears and double-booking is rejected. Uses its own host user.

const suffix = `btest-${Math.random().toString(36).slice(2, 8)}`;
let hostId: string;

beforeAll(async () => {
  const host = await db.user.create({
    data: {
      name: "Booking Test Host",
      email: `host-${suffix}@test.mv`,
      role: "SALES_REP",
      bookingSlug: `host-${suffix}`,
      availability: {
        create: {
          timezone: "Indian/Maldives",
          slotDurationMins: 30,
          bufferMins: 0,
          rules: {
            // Available every day 09:00–17:00 so the test never lands on an
            // empty weekday.
            create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              startMinutes: 9 * 60,
              endMinutes: 17 * 60,
            })),
          },
        },
      },
    },
  });
  hostId = host.id;
});

afterAll(async () => {
  await db.meeting.deleteMany({ where: { hostUserId: hostId } });
  await db.auditLog.deleteMany({ where: { entityType: "MEETING" } });
  // Booking confirmations are logged messages referencing the host
  await db.emailMessage.deleteMany({ where: { sentById: hostId } });
  await db.smsMessage.deleteMany({ where: { sentById: hostId } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

describe("public booking", () => {
  it("books an available slot, removes it, and blocks double-booking", async () => {
    const slots = await getAvailableSlots(hostId);
    expect(slots.length).toBeGreaterThan(0);

    const target = slots[0];
    const meeting = await bookMeeting({
      slug: `host-${suffix}`,
      startAtIso: target.startAt.toISOString(),
      bookerName: "Test Booker",
      bookerEmail: `booker-${suffix}@example.com`,
    });
    expect(meeting.status).toBe("CONFIRMED");
    expect(meeting.startAt.getTime()).toBe(target.startAt.getTime());

    const after = await getAvailableSlots(hostId);
    expect(after.some((s) => s.startAt.getTime() === target.startAt.getTime())).toBe(false);

    await expect(
      bookMeeting({
        slug: `host-${suffix}`,
        startAtIso: target.startAt.toISOString(),
        bookerName: "Second Booker",
        bookerEmail: `booker2-${suffix}@example.com`,
      })
    ).rejects.toThrow(/just taken/);
  });

  it("rejects forged slot times outside availability", async () => {
    await expect(
      bookMeeting({
        slug: `host-${suffix}`,
        startAtIso: "2030-01-01T02:00:00.000Z", // 07:00 MV — before opening
        bookerName: "Forger",
        bookerEmail: `forger-${suffix}@example.com`,
      })
    ).rejects.toThrow();
  });
});
