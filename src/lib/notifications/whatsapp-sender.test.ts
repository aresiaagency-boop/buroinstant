import { describe, expect, it } from "vitest";

import { isSenderConfigured, senderConfig } from "@/lib/notifications/whatsapp-sender";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/security/hmac";

const SECRETO = "un-secreto-suficientemente-largo-para-firmar";

describe("configuración del canal de salida", () => {
  it("necesita URL y secreto", () => {
    expect(senderConfig({})).toBeNull();
    expect(senderConfig({ WHATSAPP_OUTBOUND_WEBHOOK_URL: "https://n8n.example/hook" })).toBeNull();
    expect(senderConfig({ WHATSAPP_OUTBOUND_SECRET: SECRETO })).toBeNull();
  });

  it("rechaza http: un webhook sin cifrar entrega el mensaje en claro", () => {
    expect(
      senderConfig({
        WHATSAPP_OUTBOUND_WEBHOOK_URL: "http://n8n.example/hook",
        WHATSAPP_OUTBOUND_SECRET: SECRETO,
      }),
    ).toBeNull();
  });

  it("rechaza un secreto corto en vez de aceptarlo a medias", () => {
    expect(
      senderConfig({
        WHATSAPP_OUTBOUND_WEBHOOK_URL: "https://n8n.example/hook",
        WHATSAPP_OUTBOUND_SECRET: "corto",
      }),
    ).toBeNull();
  });

  it("acepta la configuración completa", () => {
    const config = senderConfig({
      WHATSAPP_OUTBOUND_WEBHOOK_URL: "https://n8n.example/hook",
      WHATSAPP_OUTBOUND_SECRET: SECRETO,
    });
    expect(config?.url).toBe("https://n8n.example/hook");
    expect(
      isSenderConfigured({
        WHATSAPP_OUTBOUND_WEBHOOK_URL: "https://n8n.example/hook",
        WHATSAPP_OUTBOUND_SECRET: SECRETO,
      }),
    ).toBe(true);
  });
});

describe("la firma que n8n tiene que comprobar", () => {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ phone: "34600000000", text: "hola", idempotencyKey: "x" });

  it("una firma correcta se verifica", () => {
    const firma = signWebhookPayload(SECRETO, timestamp, body);
    expect(
      verifyWebhookSignature({ secret: SECRETO, timestamp, signature: `sha256=${firma}`, rawBody: body }),
    ).toBe(true);
  });

  it("cambiar el cuerpo invalida la firma", () => {
    const firma = signWebhookPayload(SECRETO, timestamp, body);
    expect(
      verifyWebhookSignature({
        secret: SECRETO,
        timestamp,
        signature: `sha256=${firma}`,
        rawBody: body.replace("hola", "otra cosa"),
      }),
    ).toBe(false);
  });

  it("otro secreto no vale", () => {
    const firma = signWebhookPayload("otro-secreto-igualmente-largo-pero-distinto", timestamp, body);
    expect(
      verifyWebhookSignature({ secret: SECRETO, timestamp, signature: `sha256=${firma}`, rawBody: body }),
    ).toBe(false);
  });

  it("una marca de tiempo vieja se rechaza: no se puede reenviar un mensaje antiguo", () => {
    const viejo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const firma = signWebhookPayload(SECRETO, viejo, body);
    expect(
      verifyWebhookSignature({ secret: SECRETO, timestamp: viejo, signature: `sha256=${firma}`, rawBody: body }),
    ).toBe(false);
  });
});
