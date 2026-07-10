import { describe, expect, it } from "vitest";

import { generateSlots } from "@/services/scheduling";

// Sunday 09:00–11:00 MV time, 30-minute slots, no buffer.
const schedule = {
  timezone: "Indian/Maldives",
  slotDurationMins: 30,
  bufferMins: 0,
  rules: [{ dayOfWeek: 0, startMinutes: 9 * 60, endMinutes: 11 * 60 }],
};

// A fixed "now": Saturday 2026-07-11 12:00 MV (07:00 UTC) — the next Sunday
// is 2026-07-12.
const NOW = new Date("2026-07-11T07:00:00Z");

describe("generateSlots", () => {
  it("generates slots on the configured weekday in MV time", () => {
    const slots = generateSlots(schedule, [], NOW, 3);
    // Sunday 09:00–11:00 → 4 x 30min slots
    expect(slots).toHaveLength(4);
    // 09:00 MV = 04:00 UTC
    expect(slots[0].startAt.toISOString()).toBe("2026-07-12T04:00:00.000Z");
    expect(slots[3].startAt.toISOString()).toBe("2026-07-12T05:30:00.000Z");
  });

  it("excludes busy intervals", () => {
    const busy = [
      { start: new Date("2026-07-12T04:00:00Z"), end: new Date("2026-07-12T04:30:00Z") },
    ];
    const slots = generateSlots(schedule, busy, NOW, 3);
    expect(slots).toHaveLength(3);
    expect(slots[0].startAt.toISOString()).toBe("2026-07-12T04:30:00.000Z");
  });

  it("applies the buffer around busy intervals", () => {
    const buffered = { ...schedule, bufferMins: 15 };
    const busy = [
      { start: new Date("2026-07-12T04:30:00Z"), end: new Date("2026-07-12T05:00:00Z") },
    ];
    const slots = generateSlots(buffered, busy, NOW, 3);
    // 09:00 overlaps (ends 09:30, busy starts 09:30 minus 15min buffer),
    // 09:30 & 10:00 clash directly, 10:00–10:30 blocked by buffer after.
    expect(slots.map((s) => s.startAt.toISOString())).toEqual(["2026-07-12T05:30:00.000Z"]);
  });

  it("enforces minimum notice", () => {
    // "now" 30 minutes before the first Sunday slot → 09:00 slot too soon
    const lateNow = new Date("2026-07-12T03:30:00Z");
    const slots = generateSlots(schedule, [], lateNow, 1);
    expect(slots[0].startAt.toISOString()).not.toBe("2026-07-12T04:00:00.000Z");
  });

  it("returns nothing without rules", () => {
    expect(generateSlots({ ...schedule, rules: [] }, [], NOW, 14)).toHaveLength(0);
  });
});
