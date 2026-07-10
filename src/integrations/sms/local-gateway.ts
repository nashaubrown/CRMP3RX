import type { SmsProvider, SmsSendResult, SendSmsInput } from "./types";

// Stub for a Maldivian gateway (Dhiraagu / Ooredoo bulk-SMS HTTP APIs).
// Wire the real endpoint + credentials here when Perx signs a local contract;
// the rest of the app only knows the SmsProvider interface.
export class LocalGatewaySmsProvider implements SmsProvider {
  readonly kind = "LOCAL_GATEWAY" as const;

  async send(input: SendSmsInput): Promise<SmsSendResult> {
    // Example shape of a future implementation:
    //   const res = await fetch(process.env.LOCAL_SMS_GATEWAY_URL!, {
    //     method: "POST",
    //     headers: { Authorization: `Bearer ${process.env.LOCAL_SMS_GATEWAY_KEY}` },
    //     body: JSON.stringify({ msisdn: input.to, message: input.body }),
    //   });
    console.warn(
      `[sms:local-gateway] STUB — not sending to ${input.to}. Configure the gateway integration.`
    );
    return {
      providerId: null,
      status: "FAILED",
      error: "Local gateway is not configured yet (stub provider)",
    };
  }
}
