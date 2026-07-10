import type { EmailProvider, ProviderSendResult, SendEmailInput } from "./types";

// Dev provider: logs instead of sending, so the whole app runs without keys.
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    console.log(
      `[email:console] to=${input.to} from=${input.from} subject="${input.subject}" (${input.html.length} bytes html)`
    );
    return { providerId: `console-${Date.now()}`, status: "SENT" };
  }
}
