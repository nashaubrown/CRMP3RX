import type { EntityType } from "@prisma/client";
import { render } from "@react-email/render";

import { BaseEmail } from "@/emails/base-email";
import { db } from "@/lib/db";
import { getEmailFrom, getEmailProvider } from "@/integrations/email";
import { getSmsProvider } from "@/integrations/sms";
import { rateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/authz";
import { resolveMerchantId } from "@/services/activities";
import { getMerchantAccess } from "@/services/merchant-access";
import { audit } from "@/services/audit";

// Bulk-send guardrails (per user, sliding hour)
const EMAIL_HOURLY_LIMIT = 50;
const SMS_HOURLY_LIMIT = 25;

export type SendEmailArgs = {
  to: string;
  subject: string;
  bodyHtml: string; // already merge-var-rendered
  templateId?: string | null;
  entityType: EntityType;
  entityId: string;
};

export async function sendEmailFromRecord(ctx: SessionUser, args: SendEmailArgs) {
  const merchantId = await resolveMerchantId(args.entityType, args.entityId);
  if (!merchantId) throw new Error("Record not found");
  const access = await getMerchantAccess(ctx, merchantId);
  if (!access?.canEdit) throw new Error("You don't have edit access to this record");

  if (!rateLimit(`email:${ctx.id}`, EMAIL_HOURLY_LIMIT, 60 * 60 * 1000)) {
    throw new Error(`Hourly email limit reached (${EMAIL_HOURLY_LIMIT}/hour)`);
  }

  const from = getEmailFrom();
  const html = await render(BaseEmail({ previewText: args.subject, bodyHtml: args.bodyHtml }));

  const provider = getEmailProvider();
  const result = await provider.send({ to: args.to, from, subject: args.subject, html });

  const message = await db.emailMessage.create({
    data: {
      to: args.to,
      from,
      subject: args.subject,
      html,
      status: result.status,
      providerId: result.providerId,
      error: result.error ?? null,
      templateId: args.templateId ?? null,
      entityType: args.entityType,
      entityId: args.entityId,
      sentById: ctx.id,
      sentAt: result.status === "SENT" ? new Date() : null,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "email.send",
    entityType: args.entityType,
    entityId: args.entityId,
    merchantId,
    diff: { to: args.to, subject: args.subject, status: result.status },
  });

  if (result.status === "FAILED") {
    throw new Error(result.error ?? "Email failed to send");
  }
  return message;
}

export type SendSmsArgs = {
  to: string; // E.164
  body: string; // already merge-var-rendered
  templateId?: string | null;
  entityType: EntityType;
  entityId: string;
};

export async function sendSmsFromRecord(ctx: SessionUser, args: SendSmsArgs) {
  const merchantId = await resolveMerchantId(args.entityType, args.entityId);
  if (!merchantId) throw new Error("Record not found");
  const access = await getMerchantAccess(ctx, merchantId);
  if (!access?.canEdit) throw new Error("You don't have edit access to this record");

  // STOP-keyword suppression list
  const optedOut = await db.smsOptOut.findUnique({ where: { phone: args.to } });
  if (optedOut) {
    throw new Error("This number has opted out of SMS (STOP)");
  }

  if (!rateLimit(`sms:${ctx.id}`, SMS_HOURLY_LIMIT, 60 * 60 * 1000)) {
    throw new Error(`Hourly SMS limit reached (${SMS_HOURLY_LIMIT}/hour)`);
  }

  const provider = getSmsProvider();
  const result = await provider.send({ to: args.to, body: args.body });

  const message = await db.smsMessage.create({
    data: {
      to: args.to,
      body: args.body,
      status: result.status,
      provider: provider.kind,
      providerId: result.providerId,
      error: result.error ?? null,
      templateId: args.templateId ?? null,
      entityType: args.entityType,
      entityId: args.entityId,
      sentById: ctx.id,
      sentAt: result.status === "SENT" ? new Date() : null,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "sms.send",
    entityType: args.entityType,
    entityId: args.entityId,
    merchantId,
    diff: { to: args.to, status: result.status },
  });

  if (result.status === "FAILED") {
    throw new Error(result.error ?? "SMS failed to send");
  }
  return message;
}

// System sends (booking confirmations): no session ctx, attributed to a user id.
export async function sendSystemEmail(args: {
  to: string;
  subject: string;
  bodyHtml: string;
  sentById: string;
  entityType?: EntityType;
  entityId?: string;
}) {
  const from = getEmailFrom();
  const html = await render(BaseEmail({ previewText: args.subject, bodyHtml: args.bodyHtml }));
  const result = await getEmailProvider().send({ to: args.to, from, subject: args.subject, html });
  await db.emailMessage.create({
    data: {
      to: args.to,
      from,
      subject: args.subject,
      html,
      status: result.status,
      providerId: result.providerId,
      error: result.error ?? null,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      sentById: args.sentById,
      sentAt: result.status === "SENT" ? new Date() : null,
    },
  });
  return result;
}

export async function sendSystemSms(args: {
  to: string;
  body: string;
  sentById: string;
  entityType?: EntityType;
  entityId?: string;
}) {
  const optedOut = await db.smsOptOut.findUnique({ where: { phone: args.to } });
  if (optedOut) return { status: "FAILED" as const, providerId: null, error: "Opted out" };

  const provider = getSmsProvider();
  const result = await provider.send({ to: args.to, body: args.body });
  await db.smsMessage.create({
    data: {
      to: args.to,
      body: args.body,
      status: result.status,
      provider: provider.kind,
      providerId: result.providerId,
      error: result.error ?? null,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      sentById: args.sentById,
      sentAt: result.status === "SENT" ? new Date() : null,
    },
  });
  return result;
}

// Recent communications for a record's detail page (merged, newest first).
export async function listCommunicationsForEntity(
  _ctx: SessionUser,
  entityType: EntityType,
  entityId: string,
  limit = 10
) {
  const [emails, sms] = await Promise.all([
    db.emailMessage.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { sentBy: { select: { name: true } } },
    }),
    db.smsMessage.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { sentBy: { select: { name: true } } },
    }),
  ]);

  return [
    ...emails.map((e) => ({
      id: e.id,
      channel: "EMAIL" as const,
      to: e.to,
      summary: e.subject,
      status: e.status as string,
      senderName: e.sentBy.name,
      createdAt: e.createdAt,
    })),
    ...sms.map((s) => ({
      id: s.id,
      channel: "SMS" as const,
      to: s.to,
      summary: s.body.length > 80 ? `${s.body.slice(0, 80)}…` : s.body,
      status: s.status as string,
      senderName: s.sentBy.name,
      createdAt: s.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

// Merge vars available when composing from a record.
export async function buildMergeVars(
  ctx: SessionUser,
  entityType: EntityType,
  entityId: string
): Promise<Record<string, string>> {
  const vars: Record<string, string> = { sender_name: ctx.name ?? "The Perx team" };

  if (entityType === "MERCHANT") {
    const merchant = await db.merchant.findUnique({
      where: { id: entityId },
      include: {
        contacts: { orderBy: { isPrimary: "desc" }, take: 1 },
      },
    });
    if (merchant) {
      vars.merchant_name = merchant.name;
      // Fall back to the primary contact for contact-oriented templates
      const primary = merchant.contacts[0];
      if (primary) {
        vars.contact_first_name = primary.firstName;
        vars.contact_last_name = primary.lastName;
      }
    }
  } else if (entityType === "CONTACT") {
    const contact = await db.contact.findUnique({
      where: { id: entityId },
      include: { merchant: { select: { name: true } } },
    });
    if (contact) {
      vars.contact_first_name = contact.firstName;
      vars.contact_last_name = contact.lastName;
      vars.merchant_name = contact.merchant.name;
    }
  } else {
    const deal = await db.deal.findUnique({
      where: { id: entityId },
      include: {
        merchant: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
      },
    });
    if (deal) {
      vars.merchant_name = deal.merchant.name;
      vars.deal_title = deal.title;
      vars.deal_value = `${deal.currency} ${Number(deal.value).toLocaleString()}`;
      if (deal.contact) {
        vars.contact_first_name = deal.contact.firstName;
        vars.contact_last_name = deal.contact.lastName;
      }
    }
  }

  return vars;
}
