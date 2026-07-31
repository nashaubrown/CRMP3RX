import type Anthropic from "@anthropic-ai/sdk";
import { subDays } from "date-fns";

import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import { audit } from "@/services/audit";
import { getDealsBoard } from "@/services/deals";
import { listCommunicationsForEntity } from "@/services/messaging";
import { listDueToday, listTasks } from "@/services/tasks";

// Read-only tools for "Ask Perx". Every tool runs as the current user and
// reuses the services layer, so the model can never see more than the user.
// v1 guardrail: there are NO write-capable tools, by construction.

export const assistantToolDefinitions: Anthropic.Tool[] = [
  {
    name: "search_records",
    description:
      "Search merchants and contacts by name, company or email. Call this first when the user mentions a merchant or person by name and you don't have its id yet.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, company or email fragment to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_merchant",
    description:
      "Get full details of one merchant by id: status, Perx fields (POS system, txn volume, loyalty), owner, contacts, deals, recent activity.",
    input_schema: {
      type: "object",
      properties: { merchant_id: { type: "string" } },
      required: ["merchant_id"],
    },
  },
  {
    name: "get_contact",
    description: "Get full details of one contact by id, including their merchant and deals.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" } },
      required: ["contact_id"],
    },
  },
  {
    name: "list_deals",
    description:
      "List deals, optionally filtered by stage, owner scope, or expected close date. Use closing_within_days for questions like 'closing this month'.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"],
          description: "Filter to one stage",
        },
        scope: {
          type: "string",
          enum: ["mine", "all"],
          description: "'mine' = the current user's deals (default), 'all' = whole team",
        },
        closing_within_days: {
          type: "integer",
          description: "Only open deals expected to close within this many days",
        },
      },
      required: [],
    },
  },
  {
    name: "pipeline_summary",
    description:
      "Count and value of deals per stage (MVR and USD separately). Use for 'summarize my pipeline' questions.",
    input_schema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["mine", "all"],
          description: "'mine' = the current user's deals (default), 'all' = whole team",
        },
      },
      required: [],
    },
  },
  {
    name: "list_activities_due",
    description:
      "The current user's open tasks and meetings: overdue, due today, and upcoming. Use for 'what's on my plate' questions.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "recent_communications",
    description: "Recent emails and SMS logged on a merchant, contact or deal.",
    input_schema: {
      type: "object",
      properties: {
        entity_type: { type: "string", enum: ["MERCHANT", "CONTACT", "DEAL"] },
        entity_id: { type: "string" },
      },
      required: ["entity_type", "entity_id"],
    },
  },
  {
    name: "stale_merchants",
    description:
      "Merchants in the current user's book with no recorded activity (edits, notes, emails, SMS, deals) in the last N days. Use for 'who haven't I followed up with' questions.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Staleness threshold in days (default 14)" },
      },
      required: [],
    },
  },
];

function money(value: unknown, currency: string) {
  return `${currency} ${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

async function searchRecords(ctx: SessionUser, query: string) {
  const [merchants, contacts] = await Promise.all([
    db.merchant.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      select: { id: true, name: true, status: true, owner: { select: { name: true } } },
      take: 8,
    }),
    db.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        merchant: { select: { id: true, name: true } },
      },
      take: 8,
    }),
  ]);
  return {
    merchants: merchants.map((m) => ({
      merchant_id: m.id,
      name: m.name,
      status: m.status,
      owner: m.owner.name,
    })),
    contacts: contacts.map((c) => ({
      contact_id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      merchant: c.merchant.name,
      merchant_id: c.merchant.id,
    })),
  };
}

async function getMerchantTool(ctx: SessionUser, merchantId: string) {
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    include: {
      owner: { select: { name: true } },
      contacts: {
        select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true, isPrimary: true },
      },
      deals: {
        select: { id: true, title: true, stage: true, value: true, currency: true, expectedCloseDate: true, lostReason: true },
      },
    },
  });
  if (!merchant) return { error: "Merchant not found" };

  const activities = await db.activity.findMany({
    where: { entityType: "MERCHANT", entityId: merchantId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { owner: { select: { name: true } } },
  });

  return {
    merchant_id: merchant.id,
    name: merchant.name,
    status: merchant.status,
    category: merchant.category,
    owner: merchant.owner.name,
    pos_system: merchant.posSystem,
    monthly_txn_volume: merchant.monthlyTxnVolume,
    loyalty_live: merchant.loyaltyLive,
    email: merchant.email,
    phone: merchant.phone,
    address: merchant.address,
    notes: merchant.notes,
    contacts: merchant.contacts.map((c) => ({
      contact_id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      title: c.title,
      email: c.email,
      phone: c.phone,
      primary: c.isPrimary,
    })),
    deals: merchant.deals.map((d) => ({
      deal_id: d.id,
      title: d.title,
      stage: d.stage,
      value: money(d.value, d.currency),
      expected_close: d.expectedCloseDate ? formatDateTime(d.expectedCloseDate, "d MMM yyyy") : null,
      lost_reason: d.lostReason,
    })),
    recent_activity: activities.map((a) => ({
      type: a.type,
      subject: a.subject,
      by: a.owner.name,
      at: formatDateTime(a.createdAt),
      due: a.dueAt ? formatDateTime(a.dueAt) : null,
      completed: Boolean(a.completedAt),
    })),
  };
}

async function getContactTool(ctx: SessionUser, contactId: string) {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      merchant: { select: { id: true, name: true, status: true } },
      deals: { select: { id: true, title: true, stage: true, value: true, currency: true } },
    },
  });
  if (!contact) return { error: "Contact not found" };
  return {
    contact_id: contact.id,
    name: `${contact.firstName} ${contact.lastName}`,
    title: contact.title,
    email: contact.email,
    phone: contact.phone,
    primary: contact.isPrimary,
    merchant: { merchant_id: contact.merchant.id, name: contact.merchant.name, status: contact.merchant.status },
    deals: contact.deals.map((d) => ({
      deal_id: d.id,
      title: d.title,
      stage: d.stage,
      value: money(d.value, d.currency),
    })),
  };
}

async function listDealsTool(
  ctx: SessionUser,
  input: { stage?: string; scope?: string; closing_within_days?: number }
) {
  const scope = input.scope === "all" ? "all" : "mine";
  const { deals } = await getDealsBoard(ctx, scope);
  let filtered = deals;
  if (input.stage) filtered = filtered.filter((d) => d.stage === input.stage);
  if (input.closing_within_days) {
    const cutoff = new Date(Date.now() + input.closing_within_days * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(
      (d) =>
        !["WON", "LOST"].includes(d.stage) &&
        d.expectedCloseDate !== null &&
        new Date(d.expectedCloseDate) <= cutoff
    );
  }
  return {
    scope,
    count: filtered.length,
    deals: filtered.map((d) => ({
      deal_id: d.id,
      title: d.title,
      stage: d.stage,
      value: money(d.value, d.currency),
      merchant: d.merchantName,
      owner: d.ownerName,
      expected_close: d.expectedCloseDate
        ? formatDateTime(new Date(d.expectedCloseDate), "d MMM yyyy")
        : null,
    })),
  };
}

async function pipelineSummaryTool(ctx: SessionUser, input: { scope?: string }) {
  const scope = input.scope === "all" ? "all" : "mine";
  const { summaries } = await getDealsBoard(ctx, scope);
  return {
    scope,
    stages: summaries.map((s) => ({
      stage: s.stage,
      count: s.count,
      total_mvr: s.totalMvr,
      total_usd: s.totalUsd,
    })),
  };
}

async function listActivitiesDueTool(ctx: SessionUser) {
  const [tasks, today] = await Promise.all([
    listTasks(ctx, { scope: "mine", status: "open", view: "list", group: "due" }),
    listDueToday(ctx),
  ]);
  const now = new Date();
  return {
    overdue: tasks
      .filter((t) => t.dueAt && t.dueAt < now)
      .map((t) => ({ subject: t.title, due: formatDateTime(t.dueAt!), related_to: t.link?.label ?? null })),
    upcoming: tasks
      .filter((t) => !t.dueAt || t.dueAt >= now)
      .slice(0, 15)
      .map((t) => ({
        subject: t.title,
        due: t.dueAt ? formatDateTime(t.dueAt) : null,
        related_to: t.link?.label ?? null,
      })),
    meetings_today: today.meetings.map((m) => ({
      with: m.bookerName,
      at: formatDateTime(m.startAt),
    })),
  };
}

async function recentCommunicationsTool(
  ctx: SessionUser,
  input: { entity_type: "MERCHANT" | "CONTACT" | "DEAL"; entity_id: string }
) {
  const comms = await listCommunicationsForEntity(ctx, input.entity_type, input.entity_id);
  return {
    communications: comms.map((c) => ({
      channel: c.channel,
      to: c.to,
      summary: c.summary,
      status: c.status,
      sent_by: c.senderName,
      at: formatDateTime(c.createdAt),
    })),
  };
}

async function staleMerchantsTool(ctx: SessionUser, input: { days?: number }) {
  const days = input.days && input.days > 0 ? input.days : 14;
  const cutoff = subDays(new Date(), days);

  // The audit log records every touch (edits, notes, emails, SMS, deals),
  // so "stale" = no audit event since the cutoff.
  const merchants = await db.merchant.findMany({
    where: isAdmin(ctx) ? {} : { ownerId: ctx.id },
    select: { id: true, name: true, status: true, owner: { select: { name: true } } },
  });
  const latest = await db.auditLog.groupBy({
    by: ["merchantId"],
    where: { merchantId: { in: merchants.map((m) => m.id) } },
    _max: { createdAt: true },
  });
  const latestById = new Map(latest.map((l) => [l.merchantId, l._max.createdAt]));

  return {
    days,
    stale: merchants
      .filter((m) => {
        const last = latestById.get(m.id);
        return !last || last < cutoff;
      })
      .map((m) => ({
        merchant_id: m.id,
        name: m.name,
        status: m.status,
        owner: m.owner.name,
        last_touch: latestById.get(m.id)
          ? formatDateTime(latestById.get(m.id)!)
          : "never",
      })),
  };
}

export async function executeAssistantTool(
  ctx: SessionUser,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  await audit({
    actorId: ctx.id,
    action: "assistant.tool_call",
    entityType: "ASSISTANT",
    entityId: name,
    diff: { tool: name, input },
  });

  try {
    switch (name) {
      case "search_records":
        return JSON.stringify(await searchRecords(ctx, String(input.query ?? "")));
      case "get_merchant":
        return JSON.stringify(await getMerchantTool(ctx, String(input.merchant_id ?? "")));
      case "get_contact":
        return JSON.stringify(await getContactTool(ctx, String(input.contact_id ?? "")));
      case "list_deals":
        return JSON.stringify(await listDealsTool(ctx, input));
      case "pipeline_summary":
        return JSON.stringify(await pipelineSummaryTool(ctx, input));
      case "list_activities_due":
        return JSON.stringify(await listActivitiesDueTool(ctx));
      case "recent_communications":
        return JSON.stringify(
          await recentCommunicationsTool(
            ctx,
            input as { entity_type: "MERCHANT" | "CONTACT" | "DEAL"; entity_id: string }
          )
        );
      case "stale_merchants":
        return JSON.stringify(await staleMerchantsTool(ctx, input));
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" });
  }
}
