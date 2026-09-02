export function normalizeWhatsAppPhone(remoteJid: string) {
  const withoutDomain = remoteJid.trim().split("@")[0] ?? "";
  const normalized = withoutDomain.replace(/[^0-9]/g, "");
  if (normalized.length < 7 || normalized.length > 20) {
    throw new Error("INVALID_WHATSAPP_PHONE");
  }
  return normalized;
}

export type SendTextInput = { number: string; text: string; delay?: number };
export type SendResult = { messageId: string; status: "SENT" | "QUEUED" };

export interface WhatsAppProvider {
  sendText(input: SendTextInput): Promise<SendResult>;
}

export class EvolutionApiWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly config: { baseUrl: string; instance: string; apiKey: string },
  ) {}

  async sendText(input: SendTextInput): Promise<SendResult> {
    const number = normalizeWhatsAppPhone(input.number);
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(this.config.instance)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.apiKey,
        },
        body: JSON.stringify({ number, text: input.text, delay: input.delay ?? 800 }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) throw new Error("WHATSAPP_SEND_FAILED");
    const result = (await response.json()) as { key?: { id?: string }; messageId?: string };
    return {
      messageId: result.key?.id ?? result.messageId ?? "provider-accepted",
      status: "SENT",
    };
  }
}
