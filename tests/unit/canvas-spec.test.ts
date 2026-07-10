import { describe, expect, it } from "vitest";

import {
  canvasActionSchema,
  safeInternalHref,
  viewSpecSchema,
} from "@/lib/validators/canvas";

describe("safeInternalHref", () => {
  it("accepts internal app paths", () => {
    expect(safeInternalHref("/merchants/abc123")).toBe("/merchants/abc123");
    expect(safeInternalHref("/deals?scope=mine")).toBe("/deals?scope=mine");
  });

  it("rejects external, scheme and protocol-relative URLs", () => {
    expect(safeInternalHref("https://evil.example")).toBeNull();
    expect(safeInternalHref("javascript:alert(1)")).toBeNull();
    expect(safeInternalHref("//evil.example")).toBeNull();
    expect(safeInternalHref("data:text/html,<script>")).toBeNull();
    expect(safeInternalHref("mailto:x@y.z")).toBeNull();
    expect(safeInternalHref("relative/path")).toBeNull();
    expect(safeInternalHref(42)).toBeNull();
  });
});

describe("viewSpecSchema", () => {
  it("accepts a well-formed multi-block view and coerces numbers to strings", () => {
    const parsed = viewSpecSchema.safeParse({
      title: "Pipeline",
      blocks: [
        { type: "stat_group", stats: [{ label: "Open", value: 12, tone: "positive" }] },
        { type: "bar_chart", bars: [{ label: "NEW", value: 3000, display: "USD 3,000" }] },
        {
          type: "table",
          columns: [{ key: "name", label: "Name" }],
          rows: [{ name: "Island Bakery" }],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const stat = parsed.data.blocks[0];
      if (stat.type === "stat_group") expect(stat.stats[0].value).toBe("12");
    }
  });

  it("rejects unknown block types and external hrefs in list items", () => {
    expect(viewSpecSchema.safeParse({ title: "x", blocks: [{ type: "iframe" }] }).success).toBe(
      false
    );
    expect(
      viewSpecSchema.safeParse({
        title: "x",
        blocks: [{ type: "list", items: [{ title: "Evil", href: "https://evil.example" }] }],
      }).success
    ).toBe(false);
  });

  it("enforces block and row caps", () => {
    const tooMany = { title: "x", blocks: Array.from({ length: 21 }, () => ({ type: "text", body: "hi" })) };
    expect(viewSpecSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("canvasActionSchema", () => {
  it("parses a link action with a safe href", () => {
    const parsed = canvasActionSchema.safeParse({
      kind: "link",
      label: "Open",
      href: "/merchants/abc",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a link action with an unsafe href", () => {
    expect(
      canvasActionSchema.safeParse({ kind: "link", label: "Open", href: "javascript:alert(1)" })
        .success
    ).toBe(false);
  });

  it("parses write actions with defaults", () => {
    const parsed = canvasActionSchema.safeParse({
      kind: "log_activity",
      label: "Log call",
      entityType: "MERCHANT",
      entityId: "m1",
      subject: "Called about POS",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === "log_activity") {
      expect(parsed.data.activityType).toBe("NOTE");
    }
  });

  it("rejects unknown action kinds", () => {
    expect(
      canvasActionSchema.safeParse({ kind: "delete_merchant", label: "x", entityId: "m1" }).success
    ).toBe(false);
  });
});
