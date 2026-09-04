import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  DecryptionFailedError,
  EncryptionNotConfiguredError,
  isEncryptionConfigured,
  masterKey,
  openDocument,
  rewrapKey,
  sealDocument,
} from "@/lib/documents/encryption";

const CLAVE = randomBytes(32);
const OTRA = randomBytes(32);
const CONTENIDO = Buffer.from("Escritura de constitución · SL · dos socios", "utf8");

describe("clave maestra", () => {
  it("acepta 64 caracteres hexadecimales", () => {
    const key = masterKey({ DOCUMENT_ENCRYPTION_KEY: CLAVE.toString("hex") });
    expect(key.equals(CLAVE)).toBe(true);
  });

  it("acepta base64 de 32 bytes", () => {
    const key = masterKey({ DOCUMENT_ENCRYPTION_KEY: CLAVE.toString("base64") });
    expect(key.equals(CLAVE)).toBe(true);
  });

  it("rechaza una clave corta en vez de rellenarla", () => {
    expect(() => masterKey({ DOCUMENT_ENCRYPTION_KEY: "demasiado-corta" })).toThrow(
      EncryptionNotConfiguredError,
    );
  });

  it("rechaza la ausencia de clave", () => {
    expect(() => masterKey({})).toThrow(EncryptionNotConfiguredError);
    expect(() => masterKey({ DOCUMENT_ENCRYPTION_KEY: "   " })).toThrow(
      EncryptionNotConfiguredError,
    );
    expect(isEncryptionConfigured({})).toBe(false);
  });
});

describe("cifrado sobre", () => {
  it("lo cifrado se recupera idéntico", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    expect(openDocument(sellado, CLAVE).equals(CONTENIDO)).toBe(true);
  });

  it("el contenido cifrado no contiene el original", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    expect(sellado.ciphertext.includes(CONTENIDO)).toBe(false);
    expect(sellado.ciphertext.toString("latin1")).not.toContain("Escritura");
  });

  it("la clave envuelta no es la clave maestra ni la de datos en claro", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    expect(sellado.wrappedKey.includes(CLAVE)).toBe(false);
    // 32 bytes de clave + 16 de etiqueta.
    expect(sellado.wrappedKey.length).toBe(48);
  });

  it("dos documentos idénticos producen cifrados distintos", () => {
    const a = sealDocument(CONTENIDO, CLAVE);
    const b = sealDocument(CONTENIDO, CLAVE);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
    // La huella del contenido en claro sí coincide: sirve para detectar duplicados.
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("una clave equivocada no descifra", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    expect(() => openDocument(sellado, OTRA)).toThrow(DecryptionFailedError);
  });

  it("un byte cambiado en el contenido hace fallar el descifrado", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    const manipulado = Buffer.from(sellado.ciphertext);
    manipulado[0] = manipulado[0] ^ 0xff;
    expect(() => openDocument({ ...sellado, ciphertext: manipulado }, CLAVE)).toThrow(DecryptionFailedError);
  });

  it("un byte cambiado en la clave envuelta hace fallar el descifrado", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    const manipulada = Buffer.from(sellado.wrappedKey);
    manipulada[0] = manipulada[0] ^ 0xff;
    expect(() => openDocument({ ...sellado, wrappedKey: manipulada }, CLAVE)).toThrow(DecryptionFailedError);
  });

  it("una huella que no cuadra hace fallar el descifrado", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    expect(() => openDocument({ ...sellado, contentHash: "00".repeat(32) }, CLAVE)).toThrow(
      DecryptionFailedError,
    );
  });

  it("el error no distingue clave equivocada de contenido manipulado", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    const manipulado = Buffer.from(sellado.ciphertext);
    manipulado[0] = manipulado[0] ^ 0xff;
    let porClave = "";
    let porManipulacion = "";
    try {
      openDocument(sellado, OTRA);
    } catch (error) {
      porClave = (error as Error).message;
    }
    try {
      openDocument({ ...sellado, ciphertext: manipulado }, CLAVE);
    } catch (error) {
      porManipulacion = (error as Error).message;
    }
    expect(porClave).toBe(porManipulacion);
    expect(porClave).toBe("DOCUMENT_DECRYPTION_FAILED");
  });

  it("ningún mensaje de error contiene material de clave", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    try {
      openDocument(sellado, OTRA);
    } catch (error) {
      const texto = `${(error as Error).message} ${(error as Error).stack ?? ""}`;
      expect(texto).not.toContain(CLAVE.toString("hex"));
      expect(texto).not.toContain(CLAVE.toString("base64"));
    }
  });

  it("rechaza un documento vacío", () => {
    expect(() => sealDocument(Buffer.alloc(0), CLAVE)).toThrow("EMPTY_DOCUMENT");
  });

  it("funciona con contenido binario grande", () => {
    const grande = randomBytes(2 * 1024 * 1024);
    const sellado = sealDocument(grande, CLAVE);
    expect(sellado.sizeBytes).toBe(grande.length);
    expect(openDocument(sellado, CLAVE).equals(grande)).toBe(true);
  });
});

describe("rotación de la clave maestra", () => {
  it("reenvolver permite abrir con la clave nueva sin tocar el contenido", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    const nuevo = rewrapKey(sellado, CLAVE, OTRA);
    const rotado = { ...sellado, ...nuevo };
    // El contenido cifrado es exactamente el mismo: rotar no lo reescribe.
    expect(rotado.ciphertext.equals(sellado.ciphertext)).toBe(true);
    expect(openDocument(rotado, OTRA).equals(CONTENIDO)).toBe(true);
  });

  it("después de rotar, la clave vieja ya no abre", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    const rotado = { ...sellado, ...rewrapKey(sellado, CLAVE, OTRA) };
    expect(() => openDocument(rotado, CLAVE)).toThrow(DecryptionFailedError);
  });

  it("no se puede reenvolver con la clave equivocada", () => {
    const sellado = sealDocument(CONTENIDO, CLAVE);
    expect(() => rewrapKey(sellado, OTRA, CLAVE)).toThrow(DecryptionFailedError);
  });
});
