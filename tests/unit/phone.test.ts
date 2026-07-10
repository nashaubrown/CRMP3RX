import { describe, expect, it } from "vitest";

import { formatPhone, toE164 } from "@/lib/phone";

describe("toE164", () => {
  it("normalizes local Maldivian numbers (+960 default region)", () => {
    expect(toE164("7771234")).toBe("+9607771234");
    expect(toE164("777 1234")).toBe("+9607771234");
  });

  it("keeps international numbers", () => {
    expect(toE164("+9607771234")).toBe("+9607771234");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects garbage", () => {
    expect(toE164("not a phone")).toBeNull();
    expect(toE164("12")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("formats E.164 for display", () => {
    expect(formatPhone("+9607771234")).toContain("+960");
  });

  it("passes through unparseable values", () => {
    expect(formatPhone("garbage")).toBe("garbage");
  });
});
