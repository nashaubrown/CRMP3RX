import { describe, expect, it } from "vitest";

import { listTemplateVars, renderTemplate } from "@/lib/merge-vars";

describe("renderTemplate", () => {
  it("substitutes known vars", () => {
    expect(
      renderTemplate("Hi {{contact_first_name}} from {{merchant_name}}", {
        contact_first_name: "Ali",
        merchant_name: "Seagull Café",
      })
    ).toBe("Hi Ali from Seagull Café");
  });

  it("tolerates whitespace inside braces", () => {
    expect(renderTemplate("Hi {{ sender_name }}", { sender_name: "Hassan" })).toBe("Hi Hassan");
  });

  it("leaves unknown vars visible so senders notice them", () => {
    expect(renderTemplate("Hi {{unknown_var}}", {})).toBe("Hi {{unknown_var}}");
  });

  it("substitutes repeated vars", () => {
    expect(renderTemplate("{{a}} and {{a}}", { a: "x" })).toBe("x and x");
  });
});

describe("listTemplateVars", () => {
  it("extracts unique var names", () => {
    expect(listTemplateVars("{{a}} {{b}} {{ a }}")).toEqual(["a", "b"]);
  });
});
