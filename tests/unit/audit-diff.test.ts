import { describe, expect, it } from "vitest";

import { shallowDiff } from "@/services/audit";

describe("shallowDiff", () => {
  it("captures changed fields with from/to", () => {
    const diff = shallowDiff({ status: "PROSPECT", name: "A" }, { status: "ACTIVE", name: "A" });
    expect(diff).toEqual({ status: { from: "PROSPECT", to: "ACTIVE" } });
  });

  it("returns empty for identical records", () => {
    expect(shallowDiff({ a: 1 }, { a: 1 })).toEqual({});
  });

  it("serializes dates", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-02-01T00:00:00Z");
    const diff = shallowDiff({ closedAt: from }, { closedAt: to });
    expect(diff.closedAt).toEqual({ from: from.toISOString(), to: to.toISOString() });
  });

  it("handles null transitions", () => {
    const diff = shallowDiff({ phone: null }, { phone: "+9607771234" });
    expect(diff.phone).toEqual({ from: null, to: "+9607771234" });
  });
});
