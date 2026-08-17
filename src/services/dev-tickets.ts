import type { DevProduct, DevTicketStatus, DevTicketType } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/authz";
import {
  DEV_ATTACHMENT_MAX_BYTES,
  DEV_ATTACHMENT_TYPES,
  type DevTicketInput,
} from "@/lib/validators/dev-ticket";
import { devGroupChatId, sendDevMessage } from "@/integrations/telegram/dev-bot";
import { audit } from "@/services/audit";
import { sendSystemEmail } from "@/services/messaging";

export class DevTicketError extends Error {}

// The board's columns, in display order. WONT_DO is terminal but shown last
// so declined work stays visible rather than vanishing.
export const DEV_STATUSES: DevTicketStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
  "WONT_DO",
];

export const DEV_STATUS_LABELS: Record<DevTicketStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  TESTING: "Testing",
  DONE: "Done",
  WONT_DO: "Won't do",
};

export const DEV_PRODUCT_LABELS: Record<DevProduct, string> = {
  MERCHANT_PORTAL: "Merchant Portal",
  PERX_APP: "Perx App",
  CRM: "CRM",
};

export const DEV_TYPE_LABELS: Record<DevTicketType, string> = {
  BUG: "Bug",
  FEATURE: "Feature",
  IMPROVEMENT: "Improvement",
};

export const ticketKey = (number: number) => `PERX-${number}`;

// ---- notifications ----------------------------------------------------------
//
// Fire-and-forget on every channel: a board move must never fail or slow down
// because Telegram or the mail provider is having a day.

type NotifyTarget = { id: string; name: string; email: string | null };

async function telegramChatIdsFor(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const links = await db.telegramUserLink.findMany({ where: { crmUserId: { in: userIds } } });
  // A DM chat id is the Telegram user id.
  return new Map(links.map((l) => [l.crmUserId, l.telegramUserId]));
}

function notify(args: {
  actor: SessionUser;
  ticket: { id: string; number: number; title: string };
  line: string; // e.g. "moved to Testing"
  targets: NotifyTarget[]; // deduped, actor already excluded
}) {
  void (async () => {
    try {
      const key = ticketKey(args.ticket.number);
      const text = `<b>${key}</b> ${args.line}\n${args.ticket.title}\n— ${args.actor.name ?? "someone"}`;
      const chatIds = await telegramChatIdsFor(args.targets.map((t) => t.id));

      // The group feed: set from Telegram with /devhere (stored), or the
      // TELEGRAM_DEV_CHAT_ID env var as a fallback.
      const feed = await db.telegramDevFeed.findUnique({ where: { id: "singleton" } });
      const group = feed?.chatId ?? devGroupChatId();
      if (group) await sendDevMessage(group, text);

      for (const target of args.targets) {
        const chatId = chatIds.get(target.id);
        if (chatId) await sendDevMessage(chatId, text);
        if (target.email) {
          await sendSystemEmail({
            to: target.email,
            subject: `${key} ${args.line}`,
            bodyHtml: `<p><strong>${key}</strong> ${args.line}</p><p>${args.ticket.title}</p><p>By ${args.actor.name ?? "someone"} — open the CRM &rarr; Dev to see the ticket.</p>`,
            sentById: args.actor.id,
          }).catch(() => undefined);
        }
      }
    } catch (e) {
      console.error("dev ticket notify failed", e);
    }
  })();
}

// Reporter + assignee, minus the person who acted — the two people who care,
// never an echo of your own action.
function targetsFor(
  actor: SessionUser,
  ticket: {
    reporter: { id: string; name: string; email: string | null };
    assignee: { id: string; name: string; email: string | null } | null;
  }
): NotifyTarget[] {
  const all = [ticket.reporter, ...(ticket.assignee ? [ticket.assignee] : [])];
  const seen = new Set<string>();
  return all.filter((t) => {
    if (t.id === actor.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

// ---- queries -----------------------------------------------------------------

const TICKET_INCLUDE = {
  reporter: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  merchant: { select: { id: true, name: true } },
} as const;

export type DevTicketFilters = {
  product?: DevProduct;
  type?: DevTicketType;
  assigneeId?: string;
  mine?: boolean; // reported by or assigned to me
  q?: string;
};

// Tickets are a team artifact: every signed-in user sees the whole board.
export function listDevTickets(ctx: SessionUser, filters: DevTicketFilters = {}) {
  return db.devTicket.findMany({
    where: {
      ...(filters.product ? { product: filters.product } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.mine ? { OR: [{ reporterId: ctx.id }, { assigneeId: ctx.id }] } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" as const } },
              { description: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    include: TICKET_INCLUDE,
  });
}

export function getDevTicket(id: string) {
  return db.devTicket.findUnique({
    where: { id },
    include: {
      ...TICKET_INCLUDE,
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, filename: true, contentType: true, sizeBytes: true, createdAt: true },
      },
    },
  });
}

// The in-app history channel: everything audit() recorded for this ticket.
export function listDevTicketHistory(ticketId: string) {
  return db.auditLog.findMany({
    where: { entityType: "DEV_TICKET", entityId: ticketId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { name: true } } },
  });
}

// ---- mutations ---------------------------------------------------------------

export async function createDevTicket(ctx: SessionUser, input: DevTicketInput) {
  if (input.merchantId) {
    const m = await db.merchant.findUnique({ where: { id: input.merchantId }, select: { id: true } });
    if (!m) throw new DevTicketError("That merchant doesn't exist.");
  }
  const ticket = await db.devTicket.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      product: input.product,
      priority: input.priority,
      merchantId: input.merchantId ?? null,
      assigneeId: input.assigneeId ?? null,
      reporterId: ctx.id,
    },
    include: TICKET_INCLUDE,
  });
  await audit({
    actorId: ctx.id,
    action: "dev_ticket.create",
    entityType: "DEV_TICKET",
    entityId: ticket.id,
    merchantId: ticket.merchantId,
    diff: { key: ticketKey(ticket.number), title: ticket.title, type: ticket.type, product: ticket.product },
  });
  notify({
    actor: ctx,
    ticket,
    line: `filed (${DEV_TYPE_LABELS[ticket.type]} · ${DEV_PRODUCT_LABELS[ticket.product]})`,
    targets: targetsFor(ctx, ticket),
  });
  return ticket;
}

export async function updateDevTicket(ctx: SessionUser, id: string, input: DevTicketInput) {
  const before = await db.devTicket.findUnique({ where: { id }, include: TICKET_INCLUDE });
  if (!before) throw new DevTicketError("Ticket not found.");
  const ticket = await db.devTicket.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      product: input.product,
      priority: input.priority,
      merchantId: input.merchantId ?? null,
      assigneeId: input.assigneeId ?? null,
    },
    include: TICKET_INCLUDE,
  });
  await audit({
    actorId: ctx.id,
    action: "dev_ticket.update",
    entityType: "DEV_TICKET",
    entityId: id,
    merchantId: ticket.merchantId,
    diff: { key: ticketKey(ticket.number), title: ticket.title },
  });
  // A fresh assignment is the one edit someone must hear about.
  if (ticket.assignee && ticket.assigneeId !== before.assigneeId) {
    notify({
      actor: ctx,
      ticket,
      line: "was assigned to you",
      targets: targetsFor(ctx, { reporter: ticket.assignee, assignee: null }),
    });
  }
  return ticket;
}

export async function moveDevTicket(
  ctx: SessionUser,
  id: string,
  status: DevTicketStatus,
  position?: number
) {
  const before = await db.devTicket.findUnique({ where: { id }, include: TICKET_INCLUDE });
  if (!before) throw new DevTicketError("Ticket not found.");

  const terminal = status === "DONE" || status === "WONT_DO";
  const ticket = await db.devTicket.update({
    where: { id },
    data: {
      status,
      ...(position !== undefined ? { position } : {}),
      resolvedAt: terminal ? (before.resolvedAt ?? new Date()) : null,
    },
    include: TICKET_INCLUDE,
  });

  if (before.status !== status) {
    await audit({
      actorId: ctx.id,
      action: "dev_ticket.status",
      entityType: "DEV_TICKET",
      entityId: id,
      merchantId: ticket.merchantId,
      diff: {
        key: ticketKey(ticket.number),
        from: DEV_STATUS_LABELS[before.status],
        to: DEV_STATUS_LABELS[status],
        title: ticket.title,
      },
    });
    notify({
      actor: ctx,
      ticket,
      line: `moved to ${DEV_STATUS_LABELS[status]}`,
      targets: targetsFor(ctx, ticket),
    });
  }
  return ticket;
}

// Deleting is for mistakes, not for closing — that's what WONT_DO is for.
export async function deleteDevTicket(ctx: SessionUser, id: string) {
  const ticket = await db.devTicket.findUnique({ where: { id } });
  if (!ticket) throw new DevTicketError("Ticket not found.");
  if (!isAdmin(ctx) && ticket.reporterId !== ctx.id) {
    throw new DevTicketError("Only the reporter or an admin can delete a ticket.");
  }
  await db.devTicket.delete({ where: { id } });
  await audit({
    actorId: ctx.id,
    action: "dev_ticket.delete",
    entityType: "DEV_TICKET",
    entityId: id,
    diff: { key: ticketKey(ticket.number), title: ticket.title },
  });
}

export async function addDevTicketComment(ctx: SessionUser, ticketId: string, body: string) {
  const ticket = await db.devTicket.findUnique({ where: { id: ticketId }, include: TICKET_INCLUDE });
  if (!ticket) throw new DevTicketError("Ticket not found.");
  const comment = await db.devTicketComment.create({
    data: { ticketId, authorId: ctx.id, body },
    include: { author: { select: { id: true, name: true } } },
  });
  await audit({
    actorId: ctx.id,
    action: "dev_ticket.comment",
    entityType: "DEV_TICKET",
    entityId: ticketId,
    merchantId: ticket.merchantId,
    diff: { key: ticketKey(ticket.number), preview: body.slice(0, 120) },
  });
  notify({
    actor: ctx,
    ticket,
    line: `new comment: ${body.length > 80 ? body.slice(0, 77) + "…" : body}`,
    targets: targetsFor(ctx, ticket),
  });
  return comment;
}

// ---- attachments -------------------------------------------------------------

export async function addDevTicketAttachment(
  ctx: SessionUser,
  ticketId: string,
  file: { filename: string; contentType: string; data: Buffer }
) {
  const ticket = await db.devTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) throw new DevTicketError("Ticket not found.");
  if (!DEV_ATTACHMENT_TYPES.includes(file.contentType)) {
    throw new DevTicketError("Only images (PNG, JPG, WebP, GIF) and PDFs can be attached.");
  }
  if (file.data.byteLength > DEV_ATTACHMENT_MAX_BYTES) {
    throw new DevTicketError("Attachments are capped at 5 MB.");
  }
  return db.devTicketAttachment.create({
    data: {
      ticketId,
      filename: file.filename.slice(0, 200),
      contentType: file.contentType,
      sizeBytes: file.data.byteLength,
      data: new Uint8Array(file.data),
      uploadedById: ctx.id,
    },
    select: { id: true, filename: true },
  });
}

// Any signed-in user may view: tickets are team-wide, and the serving route
// has already authenticated the session.
export function getDevTicketAttachment(id: string) {
  return db.devTicketAttachment.findUnique({ where: { id } });
}
