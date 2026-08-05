import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { toMvLocalInputValue } from "@/lib/datetime";
import { cancelMeeting, scheduleMeeting } from "@/services/scheduling";

// User-scheduled meetings from a merchant/contact page: requires edit access,
// mirrors onto the timeline as a linked MEETING activity, and cancelling
// removes the timeline entry again.

const suffix = `mtest-${Math.random().toString(36).slice(2, 8)}`;
let ownerId: string;
let strangerId: string;
let merchantId: string;
let contactId: string;

const owner = () => ({ id: ownerId, role: "SALES_REP" as const, name: "Meeting Owner" });
const stranger = () => ({ id: strangerId, role: "SALES_REP" as const, name: "No Access" });

beforeAll(async () => {
  const [ownerUser, strangerUser] = await Promise.all([
    db.user.create({
      data: { name: "Meeting Owner", email: `owner-${suffix}@test.mv`, role: "SALES_REP" },
    }),
    db.user.create({
      data: { name: "No Access", email: `stranger-${suffix}@test.mv`, role: "SALES_REP" },
    }),
  ]);
  ownerId = ownerUser.id;
  strangerId = strangerUser.id;

  const merchant = await db.merchant.create({
    data: {
      name: `Meeting Test Merchant ${suffix}`,
      ownerId,
      contacts: {
        create: {
          firstName: "Aisha",
          lastName: "Tester",
          email: `aisha-${suffix}@example.com`,
          isPrimary: true,
        },
      },
    },
    include: { contacts: true },
  });
  merchantId = merchant.id;
  contactId = merchant.contacts[0].id;
});

afterAll(async () => {
  // The teammate schedules too now, so clear every test user's rows — not
  // just the owner's — before deleting the users.
  const userIds = (
    await db.user.findMany({ where: { email: { contains: suffix } }, select: { id: true } })
  ).map((u) => u.id);
  await db.activity.deleteMany({ where: { ownerId: { in: userIds } } });
  await db.meeting.deleteMany({ where: { hostUserId: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { merchantId } });
  await db.emailMessage.deleteMany({ where: { sentById: { in: userIds } } });
  await db.smsMessage.deleteMany({ where: { sentById: { in: userIds } } });
  await db.merchant.deleteMany({ where: { id: merchantId } });
  await db.user.deleteMany({ where: { email: { contains: suffix } } });
  await db.$disconnect();
});

function tomorrowAt(hour: number) {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return toMvLocalInputValue(d);
}

describe("scheduleMeeting", () => {
  it("creates the meeting with a linked timeline activity on the merchant", async () => {
    const meeting = await scheduleMeeting(owner(), {
      entityType: "MERCHANT",
      entityId: merchantId,
      title: "Kickoff",
      attendeeName: "Aisha Tester",
      attendeeEmail: `aisha-${suffix}@example.com`,
      startAtLocal: tomorrowAt(5), // 10:00 MV
      durationMins: 30,
      notes: "Bring the POS specs",
    });

    expect(meeting.status).toBe("CONFIRMED");
    expect(meeting.hostUserId).toBe(ownerId);
    // Attendee email matched the merchant's contact
    expect(meeting.contactId).toBe(contactId);

    const activity = await db.activity.findUnique({ where: { meetingId: meeting.id } });
    expect(activity).not.toBeNull();
    expect(activity?.type).toBe("MEETING");
    expect(activity?.entityType).toBe("MERCHANT");
    expect(activity?.entityId).toBe(merchantId);
    expect(activity?.dueAt?.getTime()).toBe(meeting.startAt.getTime());
  });

  it("lets a teammate schedule, and rejects past times", async () => {
    // Editing is team-wide now, so a teammate booking on someone else's
    // contact is legitimate.
    await expect(
      scheduleMeeting(stranger(), {
        entityType: "CONTACT",
        entityId: contactId,
        title: "Covering for the owner",
        attendeeName: "X",
        attendeeEmail: "x@example.com",
        startAtLocal: tomorrowAt(6),
        durationMins: 30,
      })
    ).resolves.toBeTruthy();

    await expect(
      scheduleMeeting(owner(), {
        entityType: "MERCHANT",
        entityId: merchantId,
        title: "Time travel",
        attendeeName: "X",
        attendeeEmail: "x@example.com",
        startAtLocal: "2020-01-01T10:00",
        durationMins: 30,
      })
    ).rejects.toThrow(/future/);
  });

  it("blocks overlapping meetings for the same host", async () => {
    await expect(
      scheduleMeeting(owner(), {
        entityType: "MERCHANT",
        entityId: merchantId,
        title: "Overlap",
        attendeeName: "Y",
        attendeeEmail: "y@example.com",
        startAtLocal: tomorrowAt(5), // same time as the kickoff above
        durationMins: 60,
      })
    ).rejects.toThrow(/already have a meeting/);
  });

  it("cancelling removes the mirrored timeline entry", async () => {
    const meeting = await scheduleMeeting(owner(), {
      entityType: "CONTACT",
      entityId: contactId,
      title: "Follow-up",
      attendeeName: "Aisha Tester",
      attendeeEmail: `aisha-${suffix}@example.com`,
      startAtLocal: tomorrowAt(9), // 14:00 MV
      durationMins: 30,
    });
    const before = await db.activity.findUnique({ where: { meetingId: meeting.id } });
    expect(before?.entityType).toBe("CONTACT");

    await cancelMeeting(owner(), meeting.id);

    const after = await db.activity.findUnique({ where: { meetingId: meeting.id } });
    expect(after).toBeNull();
    const cancelled = await db.meeting.findUnique({ where: { id: meeting.id } });
    expect(cancelled?.status).toBe("CANCELLED");
  });
});
