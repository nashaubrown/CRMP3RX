import { describe, expect, it } from "vitest";

import { outletSchema } from "@/lib/validators/outlet";

// An unchecked "primary" checkbox submits nothing → arrives as null. That must
// parse as isPrimary=false, not fail validation.
describe("outletSchema isPrimary", () => {
  it("treats a null primary flag as false", () => {
    const r = outletSchema.safeParse({
      name: "Majeedhee Magu",
      address: "",
      latitude: "4.175",
      longitude: "73.505",
      isPrimary: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isPrimary).toBe(false);
  });

  it("treats 'on' as true", () => {
    const r = outletSchema.safeParse({ name: "X", isPrimary: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isPrimary).toBe(true);
  });

  it("accepts an outlet with no coordinates", () => {
    const r = outletSchema.safeParse({ name: "Name only", latitude: "", longitude: "", isPrimary: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.latitude).toBeNull();
      expect(r.data.longitude).toBeNull();
    }
  });
});
