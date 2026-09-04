import { describe, expect, it } from "vitest";
import {
  LINK_CODE_LENGTH,
  generateLinkCode,
  linkInstructions,
  maskPhone,
  parseLinkCode,
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
