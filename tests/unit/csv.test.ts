import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "@/lib/csv";

describe("toCsv", () => {
  const columns = [
    { header: "name", value: (r: Record<string, unknown>) => r.name },
    { header: "note", value: (r: Record<string, unknown>) => r.note },
  ];

  it("quotes fields containing commas, quotes and newlines", () => {
    const csv = toCsv([{ name: 'Café "Malé", Ltd', note: "line1\nline2" }], columns);
    expect(csv).toContain('"Café ""Malé"", Ltd"');
    expect(csv).toContain('"line1\nline2"');
  });

  it("starts with a BOM and CRLF-separates rows", () => {
    const csv = toCsv([{ name: "A", note: "x" }], columns);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
  });

  it("neutralizes formula injection but keeps phone numbers intact", () => {
    const csv = toCsv(
      [
        { name: "=HYPERLINK(1)", note: "+cmd|calc" },
        { name: "+960 777-1234", note: "-42.5" },
      ],
      columns
    );
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'+cmd|calc");
    expect(csv).toContain("+960 777-1234");
    expect(csv).not.toContain("'+960");
    expect(csv).toContain("-42.5");
    expect(csv).not.toContain("'-42.5");
  });

  it("renders null/undefined as empty and booleans/dates as text", () => {
    const csv = toCsv(
      [{ name: null, note: new Date("2026-01-02T03:04:05Z") }],
      columns
    );
    const dataLine = csv.trim().split("\r\n")[1];
    expect(dataLine).toBe(",2026-01-02T03:04:05.000Z");
  });
});

describe("parseCsv", () => {
  it("parses headers case-insensitively into records", () => {
    const rows = parseCsv("Name,Email\nAisha,a@x.mv\nAli,b@x.mv\n");
    expect(rows).toEqual([
      { name: "Aisha", email: "a@x.mv" },
      { name: "Ali", email: "b@x.mv" },
    ]);
  });

  it("handles quoted fields with commas, escaped quotes and newlines", () => {
    const rows = parseCsv('name,note\n"Café ""Malé"", Ltd","line1\nline2"\n');
    expect(rows).toEqual([{ name: 'Café "Malé", Ltd', note: "line1\nline2" }]);
  });

  it("handles CRLF, BOM and missing trailing cells", () => {
    const rows = parseCsv("﻿a,b,c\r\n1,2\r\n");
    expect(rows).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("skips blank lines and returns [] for header-only input", () => {
    expect(parseCsv("a,b\n\n\n")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });

  it("round-trips toCsv output", () => {
    const columns = [
      { header: "name", value: (r: Record<string, string>) => r.name },
      { header: "note", value: (r: Record<string, string>) => r.note },
    ];
    const original = [{ name: 'Quote " and, comma', note: "multi\nline" }];
    expect(parseCsv(toCsv(original, columns))).toEqual(original);
  });
});
