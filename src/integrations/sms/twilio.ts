import twilio from "twilio";

import type { SmsProvider, SmsSendResult, SendSmsInput } from "./types";

export class TwilioSmsProvider implements SmsProvider {
  readonly kind = "TWILIO" as const;
  private client: ReturnType<typeof twilio>;
  private from: string;

  constructor(accountSid: string, authToken: string, from: string) {
    this.client = twilio(accountSid, authToken);
    this.from = from;
  }

  async send(input: SendSmsInput): Promise<SmsSendResult> {
    try {
      const statusCallback = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`
        : undefined;
      const message = await this.client.messages.create({
        to: input.to,
        from: this.from,
        body: input.body,
        statusCallback,
      });
      return { providerId: message.sid, status: "SENT" };
    } catch (e) {
      return {
        providerId: null,
        status: "FAILED",
        error: e instanceof Error ? e.message : "Unknown Twilio error",
      };
    }
  }
}
