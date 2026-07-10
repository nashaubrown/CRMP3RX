export type SendEmailInput = {
  to: string;
  from: string;
  subject: string;
  html: string;
};

export type ProviderSendResult = {
  providerId: string | null;
  status: "SENT" | "FAILED";
  error?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(input: SendEmailInput): Promise<ProviderSendResult>;
}
