import { signWebhookPayload } from "@/lib/security/hmac";

/**
 * Envío de un mensaje de WhatsApp, sin que BUROINSTANT toque nunca la clave de
 * Evolution.
 *
 * BUROINSTANT firma un payload y llama a un webhook de n8n; n8n verifica la
 * firma y es quien habla con Evolution con su propia credencial. Consecuencias
 * buscadas:
 *   · La clave de Evolution vive en un solo sitio, n8n, y no viaja a Vercel ni
 *     aparece en variables de este proyecto.
 *   · El webhook está firmado y con marca de tiempo: quien conozca la URL no
 *     puede mandar mensajes en nombre de BUROINSTANT.
 *   · Aquí no se registra ni el teléfono ni el cuerpo del mensaje.
 */

export class SenderNotConfiguredError extends Error {
  constructor() {
    super("WHATSAPP_SENDER_NOT_CONFIGURED");
    this.name = "SenderNotConfiguredError";
  }
}

export class SendFailedError extends Error {
  constructor(public readonly reason: string) {
    super("WHATSAPP_SEND_FAILED");
    this.name = "SendFailedError";
  }
}

type SenderEnv = Record<string, string | undefined>;

export function senderConfig(env: SenderEnv = process.env) {
  const url = env.WHATSAPP_OUTBOUND_WEBHOOK_URL?.trim();
  const secret = env.WHATSAPP_OUTBOUND_SECRET?.trim();
  if (!url || !secret) return null;
  // Sólo https: un webhook firmado por http entrega el mensaje en claro.
  if (!url.startsWith("https://")) return null;
  if (secret.length < 24) return null;
  return { url, secret };
}

export function isSenderConfigured(env: SenderEnv = process.env): boolean {
  return senderConfig(env) !== null;
}

export type OutboundMessage = {
  /** Teléfono en dígitos, con prefijo de país. */
  phone: string;
  text: string;
  /** Identidad del envío, para que n8n también pueda descartar repetidos. */
  idempotencyKey: string;
};

/**
 * Manda el mensaje. Devuelve el motivo del fallo en un error, nunca el
 * contenido: un log con el cuerpo del mensaje es un log con datos personales.
 */
export async function sendWhatsApp(
  message: OutboundMessage,
  options: { env?: SenderEnv; timeoutMs?: number } = {},
): Promise<void> {
  const config = senderConfig(options.env ?? process.env);
  if (!config) throw new SenderNotConfiguredError();

  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    phone: message.phone,
    text: message.text,
    idempotencyKey: message.idempotencyKey,
    source: "BUROINSTANT_DEADLINE_REMINDER",
  });
  const signature = signWebhookPayload(config.secret, timestamp, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Buroinstant-Timestamp": timestamp,
        "X-Buroinstant-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      // Sólo el código: el cuerpo de la respuesta podría repetir el mensaje.
      throw new SendFailedError(`HTTP_${response.status}`);
    }
  } catch (error) {
    if (error instanceof SendFailedError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new SendFailedError("TIMEOUT");
    throw new SendFailedError("NETWORK");
  } finally {
    clearTimeout(timer);
  }
}
