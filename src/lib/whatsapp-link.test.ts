import { describe, expect, it } from "vitest";
import {
  LINK_CODE_LENGTH,
  businessNumber,
  formatBusinessNumber,
  generateLinkCode,
  linkInstructions,
  maskPhone,
  parseLinkCode,
  readLinkAttempt,
  waLink,
} from "@/lib/whatsapp-link";

describe("código de vinculación", () => {
  it("tiene la longitud acordada", () => {
    expect(generateLinkCode()).toHaveLength(LINK_CODE_LENGTH);
  });

  it("no usa caracteres que se confunden al teclearlos", () => {
    for (let intento = 0; intento < 200; intento += 1) {
      expect(generateLinkCode()).not.toMatch(/[O0I1]/);
    }
  });

  it("es determinista con una fuente de azar dada", () => {
    const secuencia = [0, 0, 0, 0, 0, 0];
    let i = 0;
    expect(generateLinkCode(() => secuencia[i++] ?? 0)).toBe("AAAAAA");
  });
});

describe("reconocer el código en un mensaje", () => {
  it("acepta las formas en que la gente lo escribe de verdad", () => {
    for (const texto of [
      "VINCULAR ABC234",
      "vincular abc234",
      "Vincular-ABC234",
      "VINCULAR:ABC234",
      "abc234",
      "  ABC234  ",
    ]) {
      expect(parseLinkCode(texto)).toBe("ABC234");
    }
  });

  it("lo encuentra dentro de una frase si lleva el prefijo", () => {
    expect(parseLinkCode("hola, te mando VINCULAR ABC234 para enlazar")).toBe("ABC234");
  });

  it("no confunde una palabra cualquiera con un código", () => {
    for (const texto of [
      "Quiero montar una empresa de software",
      "BUENOS",
      "hola que tal",
      "necesito ayuda con el modelo 036",
      "",
      null,
      undefined,
    ]) {
      expect(parseLinkCode(texto)).toBeNull();
    }
  });

  it("no acepta un código con caracteres ambiguos", () => {
    expect(parseLinkCode("ABC01O")).toBeNull();
  });
});

describe("presentación", () => {
  it("enmascara el teléfono", () => {
    expect(maskPhone("34609454021")).toBe("••• ••• 021");
    expect(maskPhone("12")).toBe("••••");
  });

  it("las instrucciones llevan el código y el prefijo", () => {
    const texto = linkInstructions("ABC234");
    expect(texto).toContain("ABC234");
    expect(texto).toContain("VINCULAR");
    expect(texto).toContain("15 minutos");
  });
});

describe("a qué número se envía el código", () => {
  it("lee el número del entorno y lo deja en dígitos", () => {
    expect(businessNumber({ BUROINSTANT_WHATSAPP_NUMBER: "+34 600 123 456" })).toBe("34600123456");
  });

  it("sin número configurado devuelve null en vez de inventarlo", () => {
    expect(businessNumber({})).toBeNull();
    expect(businessNumber({ BUROINSTANT_WHATSAPP_NUMBER: "" })).toBeNull();
  });

  it("rechaza lo que no puede ser un número de teléfono", () => {
    expect(businessNumber({ BUROINSTANT_WHATSAPP_NUMBER: "123" })).toBeNull();
    expect(businessNumber({ BUROINSTANT_WHATSAPP_NUMBER: "1".repeat(20) })).toBeNull();
    expect(businessNumber({ BUROINSTANT_WHATSAPP_NUMBER: "pon-aqui-el-numero" })).toBeNull();
  });

  it("se muestra legible", () => {
    expect(formatBusinessNumber("34600123456")).toBe("+34 600 123 456");
  });

  it("el enlace abre WhatsApp con el mensaje ya escrito", () => {
    const enlace = waLink("34600123456", "ABC234");
    expect(enlace).toBe("https://wa.me/34600123456?text=VINCULAR%20ABC234");
  });

  it("la instrucción dice el destino cuando lo hay", () => {
    const texto = linkInstructions("ABC234", "34600123456");
    expect(texto).toContain("ABC234");
    expect(texto).toContain("+34 600 123 456");
    expect(texto).toContain("15 minutos");
  });

  it("y dice que falta el destino cuando no lo hay, en vez de callarlo", () => {
    const texto = linkInstructions("ABC234", null);
    expect(texto).toContain("Falta configurar el número");
  });
});

describe("distinguir un intento de vincular de una palabra cualquiera", () => {
  it("con el prefijo, es un intento explícito", () => {
    expect(readLinkAttempt("VINCULAR ABC234")).toEqual({ code: "ABC234", explicit: true });
    expect(readLinkAttempt("vincular: abc234")).toEqual({ code: "ABC234", explicit: true });
    expect(readLinkAttempt("Vincular, ABC234")).toEqual({ code: "ABC234", explicit: true });
  });

  it("la palabra VINCULAR sin código legible también es un intento", () => {
    // Quien escribe «vincular» y se come el código quería vincular. Decírselo
    // vale más que dejar que el agente conteste otra cosa.
    expect(readLinkAttempt("VINCULAR")).toEqual({ code: "", explicit: true });
    expect(readLinkAttempt("quiero vincular mi numero")).toEqual({ code: "", explicit: true });
  });

  it("seis caracteres sueltos son un intento, pero NO explícito", () => {
    // Puede ser un código, pero también una palabra normal. Si no canjea nada,
    // se trata como conversación y no se le dice «código inválido».
    expect(readLinkAttempt("ABC234")).toEqual({ code: "ABC234", explicit: false });
    expect(readLinkAttempt("PANADE")).toEqual({ code: "PANADE", explicit: false });
  });

  it("una frase normal no es ningún intento", () => {
    for (const texto of [
      "Quiero montar una empresa de software",
      "hola que tal",
      "necesito ayuda con el modelo 036",
      "",
      null,
      undefined,
    ]) {
      expect(readLinkAttempt(texto)).toBeNull();
    }
  });

  it("el código real del panel se reconoce", () => {
    expect(readLinkAttempt("VINCULAR FV8XC8")).toEqual({ code: "FV8XC8", explicit: true });
  });
});
