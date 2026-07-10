// {{merge_var}} substitution for message templates. Unknown vars are left
// in place so the sender notices them before hitting send.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match
  );
}

export function listTemplateVars(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    found.add(match[1]);
  }
  return [...found];
}
