import { Resend } from "resend";

import type { EmailProvider, ProviderSendResult, SendEmailInput } from "./types";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    try {
      const { data, error } = await this.client.emails.send({
        to: input.to,
        from: input.from,
        subject: input.subject,
        html: input.html,
      });
      if (error) return { providerId: null, status: "FAILED", error: error.message };
      return { providerId: data?.id ?? null, status: "SENT" };
    } catch (e) {
      return {
        providerId: null,
        status: "FAILED",
        error: e instanceof Error ? e.message : "Unknown Resend error",
      };
    }
  }
}
