import { z } from "zod";

import { getEmailFrom } from "@/integrations/email";
import { isAdmin, type SessionUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { audit } from "@/services/audit";

export const emailIdentitySchema = z.object({
  fromName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  fromEmail: z.string().trim().email("Enter a valid email address"),
});
export type EmailIdentityInput = z.input<typeof emailIdentitySchema>;

export type EmailSettingsView = {
  isAdmin: boolean;
  activeFrom: string; // what's used right now
  source: "settings" | "env";
  saved: { fromName: string | null; fromEmail: string } | null;
};

// Resolves the "from" header for outbound mail: the saved singleton, else the
// EMAIL_FROM env fallback. Used by the messaging service.
export async function resolveEmailFrom(): Promise<string> {
  try {
    const row = await db.emailSetting.findUnique({ where: { id: "singleton" } });
    if (row?.fromEmail) {
      return row.fromName ? `${row.fromName} <${row.fromEmail}>` : row.fromEmail;
    }
  } catch {
    // Table not migrated yet — fall back to env.
  }
  return getEmailFrom();
}

export async function getEmailSettings(ctx: SessionUser): Promise<EmailSettingsView> {
  const row = isAdmin(ctx)
    ? await db.emailSetting.findUnique({ where: { id: "singleton" } })
    : null;
  return {
    isAdmin: isAdmin(ctx),
    activeFrom: await resolveEmailFrom(),
    source: row?.fromEmail ? "settings" : "env",
    saved: row?.fromEmail ? { fromName: row.fromName, fromEmail: row.fromEmail } : null,
  };
}

export async function saveEmailSettings(ctx: SessionUser, input: EmailIdentityInput) {
  if (!isAdmin(ctx)) throw new Error("Only admins can set the email sender");
  const parsed = emailIdentitySchema.parse(input);

  await db.emailSetting.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      fromName: parsed.fromName ?? null,
      fromEmail: parsed.fromEmail,
      updatedById: ctx.id,
    },
    update: {
      fromName: parsed.fromName ?? null,
      fromEmail: parsed.fromEmail,
      updatedById: ctx.id,
    },
  });

  await audit({
    actorId: ctx.id,
    action: "email_settings.save",
    entityType: "EMAIL_SETTINGS",
    entityId: "singleton",
    diff: { fromName: parsed.fromName ?? null, fromEmail: parsed.fromEmail },
  });
}

export async function clearEmailSettings(ctx: SessionUser) {
  if (!isAdmin(ctx)) throw new Error("Only admins can set the email sender");
  await db.emailSetting.deleteMany({ where: { id: "singleton" } });
  await audit({
    actorId: ctx.id,
    action: "email_settings.clear",
    entityType: "EMAIL_SETTINGS",
    entityId: "singleton",
  });
}
