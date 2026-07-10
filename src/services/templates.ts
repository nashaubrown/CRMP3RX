import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/rbac";
import type { TemplateInput } from "@/lib/validators/template";
import { audit } from "@/services/audit";

// Templates are shared team assets: anyone can use them; anyone can manage
// them (internal tool; the audit log keeps changes traceable).

export async function listTemplates(channel?: "EMAIL" | "SMS") {
  return db.messageTemplate.findMany({
    where: channel ? { channel } : {},
    orderBy: { name: "asc" },
  });
}

export async function getTemplate(id: string) {
  return db.messageTemplate.findUnique({ where: { id } });
}

export async function createTemplate(ctx: SessionUser, input: TemplateInput) {
  const template = await db.messageTemplate.create({
    data: {
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "template.create",
    entityType: "TEMPLATE",
    entityId: template.id,
    diff: { name: input.name, channel: input.channel },
  });
  return template;
}

export async function updateTemplate(ctx: SessionUser, id: string, input: TemplateInput) {
  const template = await db.messageTemplate.update({
    where: { id },
    data: {
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
    },
  });
  await audit({
    actorId: ctx.id,
    action: "template.update",
    entityType: "TEMPLATE",
    entityId: id,
    diff: { name: input.name },
  });
  return template;
}

export async function deleteTemplate(ctx: SessionUser, id: string) {
  const existing = await db.messageTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error("Template not found");
  await db.messageTemplate.delete({ where: { id } });
  await audit({
    actorId: ctx.id,
    action: "template.delete",
    entityType: "TEMPLATE",
    entityId: id,
    diff: { name: existing.name },
  });
}
