import { render } from "@react-email/render";

import { BaseEmail } from "@/emails/base-email";
import { db } from "@/lib/db";
import { escapeHtml, textToHtml } from "@/lib/html";
import { getEmailProvider } from "@/integrations/email";
import { resolveEmailFrom } from "@/services/email-settings";

// All affiliate-portal emails. These are system sends to people who are not
// CRM users, so they go straight through the email provider (BaseEmail chrome,
// same as every other CRM email) without an EmailMessage timeline row — the
// timeline models communications about CRM records, which these are not.
//
// Every send is fire-safe: a provider failure is logged and swallowed, so a
// flaky email never breaks registration or a payout recording.

export function portalUrl(path = ""): string {
  const base = (process.env.AFFILIATE_PORTAL_URL ?? "http://localhost:3001").replace(/\/$/, "");
  return `${base}${path}`;
}

export async function sendAffiliateEmail(to: string, subject: string, bodyHtml: string) {
  try {
    const from = await resolveEmailFrom();
    const html = await render(BaseEmail({ previewText: subject, bodyHtml }));
    const result = await getEmailProvider().send({ to, from, subject, html });
    if (result.status === "FAILED") {
      console.error(`[affiliate-portal] email "${subject}" to ${to} failed: ${result.error}`);
    }
    return result;
  } catch (e) {
    console.error(`[affiliate-portal] email "${subject}" to ${to} threw`, e);
    return { providerId: null, status: "FAILED" as const, error: "send threw" };
  }
}

// Operational alerts (new application, bank-detail change) go to every
// active admin.
export async function notifyAdmins(subject: string, bodyHtml: string) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", disabledAt: null },
    select: { email: true },
  });
  await Promise.all(admins.map((a) => sendAffiliateEmail(a.email, subject, bodyHtml)));
}

// ---- Shared bits ----

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background-color:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-weight:600;padding:12px 24px;text-decoration:none">${escapeHtml(label)}</a></p>`;
}

function fallbackLink(href: string): string {
  return `<p style="color:#71717a;font-size:12px">If the button doesn't work, copy this link into your browser:<br/>${escapeHtml(href)}</p>`;
}

export function formatMvr(amount: number): string {
  return `MVR ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// "2026-06" -> "June 2026"
export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SCHEDULE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

// ---- Registration ----

export function registrationCodeEmail(code: string) {
  return {
    subject: `${code} is your Perx verification code`,
    bodyHtml: `
      <p>Hi,</p>
      <p>Use this code to verify your email and continue your Perx affiliate application:</p>
      <p style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0">${escapeHtml(code)}</p>
      <p>The code is valid for 15 minutes. If you didn't request it, you can safely ignore this email.</p>`,
  };
}

// Sent instead of a verification code when the email already belongs to an
// approved affiliate — the API response is identical either way (no
// enumeration); only the email differs.
export function alreadyRegisteredEmail() {
  const loginUrl = portalUrl("/login");
  return {
    subject: "You already have a Perx affiliate account",
    bodyHtml: `
      <p>Hi,</p>
      <p>Someone (hopefully you) tried to apply to the Perx affiliate program with this email — but you already have an affiliate account. Just sign in:</p>
      ${button(loginUrl, "Sign in to the affiliate portal")}
      ${fallbackLink(loginUrl)}`,
  };
}

export function applicationReceivedEmail(statusUrl: string) {
  return {
    subject: "We've received your Perx affiliate application",
    bodyHtml: `
      <p>Thanks for applying to the Perx affiliate program!</p>
      <p>The Perx team reviews applications within 2 business days — we'll email you as soon as there's news. You can check your application status any time:</p>
      ${button(statusUrl, "Check application status")}
      ${fallbackLink(statusUrl)}`,
  };
}

export function applicationApprovedEmail(args: {
  name: string;
  code: string;
  commissionRate: number;
  payoutSchedule: string;
}) {
  const loginUrl = portalUrl("/login");
  return {
    subject: "Welcome to the Perx affiliate program 🎉",
    bodyHtml: `
      <p>Hi ${escapeHtml(args.name)},</p>
      <p>Your application has been approved — welcome aboard!</p>
      <p>
        Your referral code: <strong style="font-family:monospace;font-size:18px">${escapeHtml(args.code)}</strong><br/>
        Your commission rate: <strong>${args.commissionRate}% of merchant subscriptions</strong><br/>
        You are paid: <strong>${escapeHtml(SCHEDULE_LABELS[args.payoutSchedule] ?? args.payoutSchedule)}</strong>
      </p>
      <p>Sign in to see your dashboard, share your referral link and start earning:</p>
      ${button(loginUrl, "Sign in to the affiliate portal")}
      ${fallbackLink(loginUrl)}`,
  };
}

export function applicationRejectedEmail(note?: string | null) {
  return {
    subject: "About your Perx affiliate application",
    bodyHtml: `
      <p>Hi,</p>
      <p>Thank you for your interest in the Perx affiliate program. After reviewing your application, we're unable to approve it at this time.</p>
      ${note ? `<p>${textToHtml(note)}</p>` : ""}
      <p>You're welcome to apply again after 30 days. If you think this was a mistake, just reply to this email.</p>`,
  };
}

export function newApplicationAdminEmail(args: { name: string; email: string }) {
  return {
    subject: `New affiliate application: ${args.name}`,
    bodyHtml: `
      <p><strong>${escapeHtml(args.name)}</strong> (${escapeHtml(args.email)}) has applied to the affiliate program.</p>
      <p>Review the application in the CRM under Affiliates &rarr; Applications.</p>`,
  };
}

// ---- Sign-in ----

export function magicLinkEmail(url: string) {
  return {
    subject: "Your Perx affiliate sign-in link",
    bodyHtml: `
      <p>Hi,</p>
      <p>Tap the button below to sign in to your Perx affiliate account. The link works once and expires in 15 minutes.</p>
      ${button(url, "Sign in")}
      ${fallbackLink(url)}
      <p>If you didn't request this, you can safely ignore this email — nobody can sign in without it.</p>`,
  };
}

// Sent instead of a magic link when a pending applicant tries to sign in.
export function stillUnderReviewEmail() {
  return {
    subject: "Your Perx affiliate application is still under review",
    bodyHtml: `
      <p>Hi,</p>
      <p>You tried to sign in to the Perx affiliate portal, but your application is still being reviewed. We'll email you as soon as it's approved — usually within 2 business days.</p>`,
  };
}

// ---- Commissions ----

export function commissionRecordedEmail(args: { period: string; amountMvr: number }) {
  const url = portalUrl("/earnings");
  return {
    subject: `Your ${formatPeriod(args.period)} commission has been recorded`,
    bodyHtml: `
      <p>Good news — your <strong>${escapeHtml(formatPeriod(args.period))}</strong> commission has been recorded: <strong>${formatMvr(args.amountMvr)}</strong> (Pending).</p>
      <p>We'll email you again when it's paid.</p>
      ${button(url, "View your earnings")}`,
  };
}

export function commissionPaidEmail(args: { period: string; amountMvr: number }) {
  const url = portalUrl("/earnings");
  return {
    subject: `Your ${formatPeriod(args.period)} commission has been paid`,
    bodyHtml: `
      <p>Your <strong>${escapeHtml(formatPeriod(args.period))}</strong> commission of <strong>${formatMvr(args.amountMvr)}</strong> has been paid to your registered bank account.</p>
      ${button(url, "View your earnings")}`,
  };
}

// ---- Bank details ----

export function bankChangeConfirmEmail(url: string) {
  return {
    subject: "Confirm it's you — bank detail change",
    bodyHtml: `
      <p>You asked to update the bank details on your Perx affiliate account — the account your commission is paid to.</p>
      <p>To confirm it's really you, tap the button below. The link works once and expires in 15 minutes.</p>
      ${button(url, "Confirm and update bank details")}
      ${fallbackLink(url)}
      <p><strong>If you didn't request this, do not click the button</strong> — and contact the Perx team immediately.</p>`,
  };
}

export function bankChangedAffiliateEmail() {
  return {
    subject: "Your bank details were changed",
    bodyHtml: `
      <p>The bank details on your Perx affiliate account were just updated. Future commission payments will go to the new account.</p>
      <p><strong>If this wasn't you, contact the Perx team immediately</strong> so we can freeze payouts and secure your account.</p>`,
  };
}

export function bankChangedAdminEmail(args: { name: string; code: string; last4: string }) {
  return {
    subject: `Affiliate bank details changed: ${args.name}`,
    bodyHtml: `
      <p>Affiliate <strong>${escapeHtml(args.name)}</strong> (code ${escapeHtml(args.code)}) just changed their payout bank account (new account ending &bull;&bull;&bull;&bull; ${escapeHtml(args.last4)}).</p>
      <p>This is a routine security notification — if the change looks suspicious, review it in the CRM and hold any pending payouts.</p>`,
  };
}
