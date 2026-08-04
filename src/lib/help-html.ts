// Renders Plate editor JSON (Slate nodes) to the HTML served on the public
// help site. Deterministic and dependency-free so the seed script, the
// services layer and tests all produce identical output.
//
// Node shapes handled (matching the plugin set in help-plate.ts):
//  - p (plain, or list item via indent + listStyleType [+ listStart])
//  - h1/h2/h3 (h1 is normalised to h2 on the public site; h2 gets an id for TOC)
//  - blockquote, table > tr > th/td > p, img {url, caption}, a {url}
//  - text marks: bold, italic, underline, code

export type PlateText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
};

export type PlateNode = {
  type?: string;
  children?: PlateNode[];
  url?: string;
  caption?: PlateText[];
  indent?: number;
  listStyleType?: string;
  listStart?: number;
  [key: string]: unknown;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function isText(n: PlateNode | PlateText): n is PlateText {
  return typeof (n as PlateText).text === "string";
}

function renderText(t: PlateText): string {
  let html = escapeHtml(t.text);
  if (t.code) html = `<code>${html}</code>`;
  if (t.bold) html = `<strong>${html}</strong>`;
  if (t.italic) html = `<em>${html}</em>`;
  if (t.underline) html = `<u>${html}</u>`;
  return html;
}

function renderInline(nodes: (PlateNode | PlateText)[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (isText(n)) return renderText(n);
      if (n.type === "a") {
        return `<a href="${escapeAttr(String(n.url ?? "#"))}">${renderInline(n.children)}</a>`;
      }
      return renderInline(n.children);
    })
    .join("");
}

function plainText(nodes: (PlateNode | PlateText)[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => (isText(n) ? n.text : plainText(n.children)))
    .join("");
}

type ListRun = { ordered: boolean; items: string[]; start: number };

export type HelpToc = { id: string; text: string }[];

export function plateToHtml(nodes: PlateNode[]): { html: string; toc: HelpToc } {
  const out: string[] = [];
  const toc: HelpToc = [];
  let list: ListRun | null = null;

  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    const startAttr =
      list.ordered && list.start > 1 ? ` start="${list.start}"` : "";
    out.push(
      `<${tag}${startAttr}>` +
        list.items.map((i) => `<li>${i}</li>`).join("") +
        `</${tag}>`
    );
    list = null;
  };

  for (const node of nodes) {
    const type = node.type ?? "p";
    const isListItem =
      type === "p" && typeof node.listStyleType === "string" && (node.indent ?? 0) > 0;

    if (isListItem) {
      const ordered = node.listStyleType === "decimal";
      const start = typeof node.listStart === "number" ? node.listStart : 1;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [], start };
      }
      list.items.push(renderInline(node.children));
      continue;
    }
    flushList();

    switch (type) {
      case "h1":
      case "h2": {
        const text = plainText(node.children);
        const id = slugifyHeading(text);
        toc.push({ id, text });
        out.push(`<h2 id="${escapeAttr(id)}">${renderInline(node.children)}</h2>`);
        break;
      }
      case "h3": {
        const text = plainText(node.children);
        out.push(
          `<h3 id="${escapeAttr(slugifyHeading(text))}">${renderInline(node.children)}</h3>`
        );
        break;
      }
      case "blockquote":
        out.push(`<blockquote><p>${renderInline(node.children)}</p></blockquote>`);
        break;
      case "img": {
        const alt = node.caption ? plainText(node.caption) : "";
        out.push(
          `<p><img src="${escapeAttr(String(node.url ?? ""))}" alt="${escapeAttr(alt)}" loading="lazy"></p>`
        );
        break;
      }
      case "table": {
        const rows = (node.children ?? []).filter((r) => r.type === "tr");
        const rendered = rows
          .map((row, ri) => {
            const cells = (row.children ?? [])
              .map((cell) => {
                const tag = cell.type === "th" || ri === 0 ? "th" : "td";
                return `<${tag}>${renderInline(cell.children)}</${tag}>`;
              })
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        out.push(`<table>${rendered}</table>`);
        break;
      }
      case "code_block": {
        const code = (node.children ?? [])
          .map((line) => plainText(line.children ?? [line as unknown as PlateText]))
          .join("\n");
        out.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
        break;
      }
      default: {
        const inner = renderInline(node.children);
        if (inner.trim() === "") break;
        out.push(`<p>${inner}</p>`);
      }
    }
  }
  flushList();
  return { html: out.join("\n"), toc };
}
