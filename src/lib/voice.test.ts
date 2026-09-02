import { describe, expect, it } from "vitest";
import {
  VOICE_MAX_BYTES,
  extensionForAudioMimeType,
  isSupportedAudioMimeType,
  normalizeAudioMimeType,
  sanitizeTranscript,
  validateVoiceUpload,
} from "@/lib/voice";

describe("tipos de audio admitidos", () => {
  it("descarta los parámetros del codec", () => {
    expect(normalizeAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeAudioMimeType(" AUDIO/OGG ; codecs=opus")).toBe("audio/ogg");
  });

  it("acepta lo que graban los navegadores reales", () => {
    for (const type of ["audio/webm;codecs=opus", "audio/ogg", "audio/mp4", "audio/mpeg"]) {
      expect(isSupportedAudioMimeType(type)).toBe(true);
    }
  });

  it("rechaza cualquier cosa que no sea audio", () => {
    for (const type of ["video/mp4", "application/pdf", "text/html", "", null, undefined]) {
      expect(isSupportedAudioMimeType(type)).toBe(false);
    }
  });

  it("propone una extensión conocida por el transcriptor", () => {
    expect(extensionForAudioMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForAudioMimeType("audio/x-m4a")).toBe("m4a");
  });
});

describe("validación de la carga de voz", () => {
  it("acepta una nota de voz normal", () => {
    const result = validateVoiceUpload({ size: 240_000, type: "audio/webm;codecs=opus" });
    expect(result).toMatchObject({ ok: true, mimeType: "audio/webm", extension: "webm" });
  });

  it("rechaza el audio vacío", () => {
    expect(validateVoiceUpload({ size: 0, type: "audio/webm" })).toEqual({
      ok: false,
      reason: "EMPTY_AUDIO",
    });
  });

  it("rechaza por encima del límite antes de gastar transcripción", () => {
    expect(validateVoiceUpload({ size: VOICE_MAX_BYTES + 1, type: "audio/webm" })).toEqual({
      ok: false,
      reason: "AUDIO_TOO_LARGE",
    });
  });

  it("rechaza un ejecutable disfrazado de nota de voz", () => {
    expect(validateVoiceUpload({ size: 1_000, type: "application/octet-stream" })).toEqual({
      ok: false,
      reason: "UNSUPPORTED_AUDIO_TYPE",
    });
  });
});

describe("saneado de la transcripción", () => {
  it("colapsa el espacio en blanco", () => {
    expect(sanitizeTranscript("  Quiero   crear\n\nuna  SL  ")).toBe("Quiero crear una SL");
  });

  it("elimina los caracteres de control", () => {
    const withControls = `Quiero${String.fromCharCode(0)}crear${String.fromCharCode(7)}una SL`;
    expect(sanitizeTranscript(withControls)).toBe("Quiero crear una SL");
  });

  it("conserva los acentos y la eñe", () => {
    expect(sanitizeTranscript("Una compañía de diseño en Alcañiz")).toBe(
      "Una compañía de diseño en Alcañiz",
    );
  });

  it("acota la longitud", () => {
    expect(sanitizeTranscript("a".repeat(9_000))).toHaveLength(4_000);
  });

  it("tolera la ausencia de texto", () => {
    expect(sanitizeTranscript(null)).toBe("");
    expect(sanitizeTranscript(undefined)).toBe("");
  });
});
