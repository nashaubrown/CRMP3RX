import type { EmailProvider, ProviderSendResult, SendEmailInput } from "./types";

// Dev provider: logs instead of sending, so the whole app runs without keys.
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    console.log(
      `[email:console] to=${input.to} from=${input.from} subject="${input.subject}" (${input.html.length} bytes html)`
    );
    // Log the links too (magic links, confirmation links) — without a real
    // provider they are unreachable otherwise. Never active once
    // RESEND_API_KEY is configured.
    const links = [...input.html.matchAll(/href="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((href) => href.startsWith("http"));
    for (const link of links) {
      console.log(`[email:console]   link: ${link}`);
    }
    return { providerId: `console-${Date.now()}`, status: "SENT" };
  }
}
