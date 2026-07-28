import { describe, expect, it } from "vitest";

import { contactSchema } from "@/lib/validators/contact";
import { merchantSchema } from "@/lib/validators/merchant";

// The phone field is prefilled with "+960 " for convenience; leaving it as the
// bare prefix must count as "no phone", not a validation error.

describe("optional phone (bare +960 prefix)", () => {
  it("merchant: a bare +960 prefix is treated as no phone", () => {
    const r = merchantSchema.safeParse({ name: "Shop", status: "PROSPECT", phone: "+960 " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeUndefined();
  });

  it("merchant: a real number still parses to E.164", () => {
    const r = merchantSchema.safeParse({ name: "Shop", status: "PROSPECT", phone: "+960 777 1234" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("+9607771234");
  });

  it("contact: a bare +960 prefix is treated as no phone", () => {
    const r = contactSchema.safeParse({
      firstName: "A",
      lastName: "B",
      phone: "+960 ",
      merchantIds: ["m1"],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeUndefined();
  });
});
