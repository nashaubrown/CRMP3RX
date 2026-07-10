import type { SmsProvider, SmsSendResult, SendSmsInput } from "./types";

// Dev provider: logs instead of sending.
export class ConsoleSmsProvider implements SmsProvider {
  readonly kind = "CONSOLE" as const;

  async send(input: SendSmsInput): Promise<SmsSendResult> {
    console.log(`[sms:console] to=${input.to} body="${input.body}"`);
    return { providerId: `console-${Date.now()}`, status: "SENT" };
  }
}
