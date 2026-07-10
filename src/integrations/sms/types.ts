import type { SmsProviderKind } from "@prisma/client";

export type SendSmsInput = {
  to: string; // E.164
  body: string;
};

export type SmsSendResult = {
  providerId: string | null;
  status: "SENT" | "FAILED";
  error?: string;
};

export interface SmsProvider {
  readonly kind: SmsProviderKind;
  send(input: SendSmsInput): Promise<SmsSendResult>;
}
