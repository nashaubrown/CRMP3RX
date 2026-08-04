import { describe, expect, it } from "vitest";

import { plateToHtml, type PlateNode } from "@/lib/help-html";

describe("plateToHtml", () => {
  it("renders headings with slug ids and builds a TOC from h2s", () => {
    const nodes: PlateNode[] = [
      { type: "h2", children: [{ text: "Step 1 — Reward Info" }] },
      { type: "p", children: [{ text: "Hello" }] },
      { type: "h3", children: [{ text: "Sub section" }] },
    ];
    const { html, toc } = plateToHtml(nodes);
    expect(html).toContain('<h2 id="step-1-reward-info">Step 1 — Reward Info</h2>');
    expect(html).toContain('<h3 id="sub-section">Sub section</h3>');
    expect(toc).toEqual([{ id: "step-1-reward-info", text: "Step 1 — Reward Info" }]);
  });

  it("renders marks and links, escaping HTML", () => {
    const nodes: PlateNode[] = [
      {
        type: "p",
        children: [
          { text: "a " },
          { text: "bold", bold: true },
          { text: " & " },
          { type: "a", url: "/x/", children: [{ text: "<link>" }] },
        ] as PlateNode[],
      },
    ];
    const { html } = plateToHtml(nodes);
    expect(html).toBe('<p>a <strong>bold</strong> &amp; <a href="/x/">&lt;link&gt;</a></p>');
  });

  it("groups consecutive indent list items into ul/ol", () => {
    const nodes: PlateNode[] = [
      { type: "p", indent: 1, listStyleType: "disc", children: [{ text: "one" }] },
      { type: "p", indent: 1, listStyleType: "disc", children: [{ text: "two" }] },
      { type: "p", indent: 1, listStyleType: "decimal", listStart: 1, children: [{ text: "first" }] },
      { type: "p", indent: 1, listStyleType: "decimal", listStart: 2, children: [{ text: "second" }] },
      { type: "p", children: [{ text: "after" }] },
    ];
    const { html } = plateToHtml(nodes);
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(html).toContain("<p>after</p>");
  });

  it("renders tables with header row and images with captions", () => {
    const cell = (type: string, text: string): PlateNode => ({
      type,
      children: [{ type: "p", children: [{ text }] }],
    });
    const nodes: PlateNode[] = [
      {
        type: "table",
        children: [
          { type: "tr", children: [cell("th", "A"), cell("th", "B")] },
          { type: "tr", children: [cell("td", "1"), cell("td", "2")] },
        ],
      },
      {
        type: "img",
        url: "/screenshots/x.jpg",
        caption: [{ text: "The dashboard" }],
        children: [{ text: "" }],
      },
    ];
    const { html } = plateToHtml(nodes);
    expect(html).toContain("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");
    expect(html).toContain('<img src="/screenshots/x.jpg" alt="The dashboard" loading="lazy">');
  });

  it("renders blockquotes and skips empty paragraphs", () => {
    const nodes: PlateNode[] = [
      { type: "blockquote", children: [{ text: "Tip: do the thing." }] },
      { type: "p", children: [{ text: "" }] },
    ];
    const { html } = plateToHtml(nodes);
    expect(html).toBe("<blockquote><p>Tip: do the thing.</p></blockquote>");
  });
});
