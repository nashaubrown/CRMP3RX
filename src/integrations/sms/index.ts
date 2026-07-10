import { ConsoleSmsProvider } from "./console";
import { LocalGatewaySmsProvider } from "./local-gateway";
import { TwilioSmsProvider } from "./twilio";
import type { SmsProvider } from "./types";

export type { SmsProvider, SmsSendResult, SendSmsInput } from "./types";

let provider: SmsProvider | null = null;

// Selected via SMS_PROVIDER env: TWILIO | LOCAL_GATEWAY | CONSOLE (default)
export function getSmsProvider(): SmsProvider {
  if (!provider) {
    const kind = (process.env.SMS_PROVIDER ?? "CONSOLE").toUpperCase();
    if (kind === "TWILIO") {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM_NUMBER;
      if (!sid || !token || !from) {
        console.warn("[sms] SMS_PROVIDER=TWILIO but credentials missing — using console");
        provider = new ConsoleSmsProvider();
      } else {
        provider = new TwilioSmsProvider(sid, token, from);
      }
    } else if (kind === "LOCAL_GATEWAY") {
      provider = new LocalGatewaySmsProvider();
    } else {
      provider = new ConsoleSmsProvider();
    }
  }
  return provider;
}
