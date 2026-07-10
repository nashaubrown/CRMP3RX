// Translate raw AuditLog rows into human-readable history entries.
// Shared by the merchant/contact History cards and the dashboard feed.

export type FieldChange = { field: string; from: string; to: string };

export type HistoryEvent = {
  id: string;
  actorName: string;
  actorId: string | null;
  // e.g. "updated this merchant", "added contact Ahmed Tester"
  title: string;
  changes: FieldChange[];
  category: "record" | "contacts" | "sharing" | "activity";
  createdAt: Date;
};

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  category: "category",
  status: "status",
  website: "website",
  phone: "phone",
  email: "email",
  address: "address",
  notes: "notes",
  posSystem: "POS system",
  monthlyTxnVolume: "monthly txn volume",
  loyaltyLive: "loyalty live",
  ownerId: "owner",
  firstName: "first name",
  lastName: "last name",
  title: "title",
  merchantId: "merchant",
  isPrimary: "primary contact",
};

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === true) return "yes";
  if (value === false) return "no";
  return String(value);
}

function toChanges(changes: unknown): FieldChange[] {
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes as Record<string, { from?: unknown; to?: unknown }>)
    .filter(([, v]) => v && typeof v === "object")
    .map(([field, v]) => ({
      field: FIELD_LABELS[field] ?? field,
      from: fmt(v.from),
      to: fmt(v.to),
    }));
}

type RawEvent = {
  id: string;
  action: string;
  diff: unknown;
  createdAt: Date;
  actorId: string | null;
  actor: { name: string } | null;
};

export function describeEvent(event: RawEvent): HistoryEvent {
  const diff = (event.diff ?? {}) as Record<string, unknown>;
  const base = {
    id: event.id,
    actorId: event.actorId,
    actorName: event.actor?.name ?? "Someone",
    createdAt: event.createdAt,
    changes: [] as FieldChange[],
  };

  switch (event.action) {
    case "merchant.create":
      return { ...base, category: "record", title: "created this merchant" };
    case "merchant.update":
      return {
        ...base,
        category: "record",
        title: "updated merchant details",
        changes: toChanges(diff),
      };
    case "merchant.delete":
      return { ...base, category: "record", title: `deleted merchant ${fmt(diff.name)}` };

    case "contact.create":
      return {
        ...base,
        category: "contacts",
        title: `added contact ${fmt(diff.firstName)} ${fmt(diff.lastName)}`,
      };
    case "contact.update":
      return {
        ...base,
        category: "contacts",
        title: `updated contact ${fmt(diff.contactName)}`,
        changes: toChanges(diff.changes),
      };
    case "contact.delete":
      return {
        ...base,
        category: "contacts",
        title: `deleted contact ${fmt(diff.firstName)} ${fmt(diff.lastName)}`,
      };

    case "merchant.share":
      return {
        ...base,
        category: "sharing",
        title: `shared with ${fmt(diff.userName)} (${String(diff.permission ?? "").toLowerCase()})`,
      };
    case "merchant.unshare":
      return {
        ...base,
        category: "sharing",
        title: `removed ${fmt(diff.userName)}'s access`,
      };

    case "activity.create":
      return {
        ...base,
        category: "activity",
        title: `logged a ${String(diff.type ?? "note").toLowerCase()}: ${fmt(diff.subject)}`,
      };
    case "activity.complete":
      return { ...base, category: "activity", title: `completed: ${fmt(diff.subject)}` };
    case "activity.reopen":
      return { ...base, category: "activity", title: `reopened: ${fmt(diff.subject)}` };
    case "activity.delete":
      return { ...base, category: "activity", title: `deleted activity: ${fmt(diff.subject)}` };

    default:
      return { ...base, category: "record", title: event.action };
  }
}
