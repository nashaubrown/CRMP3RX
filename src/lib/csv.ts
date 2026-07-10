// Minimal, dependency-free CSV serializer + parser (RFC 4180 style:
// quoted fields, escaped quotes, CR/LF line endings).

export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  let s = String(value);

  // Formula-injection guard for spreadsheet apps: neutralize cells starting
  // with =, @, or +/- followed by non-numeric content. Plain numbers and
  // E.164 phone numbers ("+960…") are left intact so re-import round-trips.
  if (/^[=@]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s()./-]*$/.test(s))) {
    s = `'${s}`;
  }

  if (/[",\r\n]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => formatCell(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => formatCell(c.value(row))).join(",")),
  ];
  // BOM so Excel opens UTF-8 correctly.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// Parse CSV text into an array of records keyed by lower-cased header names.
// Handles quoted fields (embedded commas, quotes, newlines) and CRLF/LF.
export function parseCsv(text: string): Record<string, string>[] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Skip rows that are entirely empty (e.g. trailing newline)
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  if (rows.length < 1) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) record[h] = (cells[i] ?? "").trim();
    });
    return record;
  });
}
