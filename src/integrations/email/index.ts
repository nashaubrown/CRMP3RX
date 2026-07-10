import { ConsoleEmailProvider } from "./console";
import { ResendEmailProvider } from "./resend";
import type { EmailProvider } from "./types";

export type { EmailProvider, ProviderSendResult, SendEmailInput } from "./types";

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    const key = process.env.RESEND_API_KEY;
    provider = key ? new ResendEmailProvider(key) : new ConsoleEmailProvider();
  }
  return provider;
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM ?? "Perx CRM <crm@example.com>";
}
