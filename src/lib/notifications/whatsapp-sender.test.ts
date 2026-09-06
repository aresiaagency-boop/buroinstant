import { afterEach, describe, expect, it } from "vitest";

import { SendFailedError, isSenderConfigured, sendWhatsApp, senderConfig } from "@/lib/notifications/whatsapp-sender";
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

describe("un 200 no basta para dar el aviso por enviado", () => {
  const CONFIG = {
    WHATSAPP_OUTBOUND_WEBHOOK_URL: "https://n8n.example/hook",
    WHATSAPP_OUTBOUND_SECRET: SECRETO,
  };
  const MENSAJE = { phone: "34600000000", text: "aviso", idempotencyKey: "k" };

  function conRespuesta(status: number, body: string) {
    return async () =>
      new Response(body, { status, headers: { "Content-Type": "application/json" } });
  }

  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("acepta el envío sólo cuando el cuerpo confirma ok:true", async () => {
    globalThis.fetch = conRespuesta(200, JSON.stringify({ ok: true })) as typeof fetch;
    await expect(sendWhatsApp(MENSAJE, { env: CONFIG })).resolves.toBeUndefined();
  });

  it("un 200 con cuerpo vacío NO cuenta como enviado", async () => {
    // Es exactamente lo que devuelve n8n cuando el workflow revienta antes de
    // llegar a su nodo de respuesta: nada salió, pero el HTTP dice 200.
    globalThis.fetch = conRespuesta(200, "") as typeof fetch;
    await expect(sendWhatsApp(MENSAJE, { env: CONFIG })).rejects.toThrow(SendFailedError);
  });

  it("un 200 diciendo ok:false tampoco cuenta", async () => {
    globalThis.fetch = conRespuesta(200, JSON.stringify({ ok: false, error: "ENV_ACCESS_DENIED" })) as typeof fetch;
    await expect(sendWhatsApp(MENSAJE, { env: CONFIG })).rejects.toThrow(SendFailedError);
  });

  it("el motivo del fallo lo dice, para poder arreglarlo", async () => {
    globalThis.fetch = conRespuesta(200, "") as typeof fetch;
    try {
      await sendWhatsApp(MENSAJE, { env: CONFIG });
      throw new Error("debería haber fallado");
    } catch (error) {
      expect((error as SendFailedError).reason).toBe("NOT_CONFIRMED");
    }
  });

  it("un 401 sigue fallando con su código", async () => {
    globalThis.fetch = conRespuesta(401, JSON.stringify({ ok: false })) as typeof fetch;
    try {
      await sendWhatsApp(MENSAJE, { env: CONFIG });
      throw new Error("debería haber fallado");
    } catch (error) {
      expect((error as SendFailedError).reason).toBe("HTTP_401");
    }
  });

  it("ningún motivo de fallo contiene el texto del mensaje ni el secreto", async () => {
    globalThis.fetch = conRespuesta(200, JSON.stringify({ ok: false, text: "aviso" })) as typeof fetch;
    try {
      await sendWhatsApp({ ...MENSAJE, text: "contenido personal" }, { env: CONFIG });
    } catch (error) {
      const texto = `${(error as Error).message} ${(error as SendFailedError).reason}`;
      expect(texto).not.toContain("contenido personal");
      expect(texto).not.toContain(SECRETO);
    }
  });
});
