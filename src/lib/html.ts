// Escape user-supplied text before interpolating it into HTML (emails).
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Plain text -> safe HTML with line breaks preserved.
export function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}
