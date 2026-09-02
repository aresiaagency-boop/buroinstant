/**
 * Canal de mensaje de voz (web).
 *
 * Módulo puro: no importa Next ni toca la red, de modo que las reglas que
 * protegen la entrada se pueden probar sin levantar el servidor.
 *
 * Todo audio recibido por este canal es UNTRUSTED_USER_INPUT, igual que un
 * mensaje de WhatsApp: se valida por tamaño y tipo antes de enviarlo a
 * transcripción, y la transcripción se sanea antes de entrar en la tubería
 * de ingesta. En ningún punto se interpreta como instrucción.
 */

/** Límite de carga. Un mensaje de voz de dos minutos en Opus ronda 1 MB. */
export const VOICE_MAX_BYTES = 8 * 1024 * 1024;
/** Duración máxima que el cliente corta por su cuenta. */
export const VOICE_MAX_SECONDS = 120;
/** Longitud máxima de transcripción aceptada hacia la ingesta. */
export const VOICE_MAX_TRANSCRIPT_CHARS = 4000;

const SUPPORTED_AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/oga": "oga",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
};

export type VoiceRejectionReason =
  | "EMPTY_AUDIO"
  | "AUDIO_TOO_LARGE"
  | "UNSUPPORTED_AUDIO_TYPE"
  | "TRANSCRIPT_EMPTY";

export type VoiceUploadValidation =
  | { ok: true; mimeType: string; extension: string; bytes: number }
  | { ok: false; reason: VoiceRejectionReason };

/** "audio/webm;codecs=opus" produce "audio/webm". */
export function normalizeAudioMimeType(raw: string | null | undefined): string {
  const [head] = String(raw ?? "").split(";");
  return (head ?? "").trim().toLowerCase();
}

export function isSupportedAudioMimeType(raw: string | null | undefined): boolean {
  return normalizeAudioMimeType(raw) in SUPPORTED_AUDIO_TYPES;
}

export function extensionForAudioMimeType(raw: string | null | undefined): string {
  return SUPPORTED_AUDIO_TYPES[normalizeAudioMimeType(raw)] ?? "webm";
}

export function validateVoiceUpload(input: {
  size: number;
  type: string | null | undefined;
}): VoiceUploadValidation {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, reason: "EMPTY_AUDIO" };
  }
  if (input.size > VOICE_MAX_BYTES) {
    return { ok: false, reason: "AUDIO_TOO_LARGE" };
  }
  const mimeType = normalizeAudioMimeType(input.type);
  if (!isSupportedAudioMimeType(mimeType)) {
    return { ok: false, reason: "UNSUPPORTED_AUDIO_TYPE" };
  }
  return {
    ok: true,
    mimeType,
    extension: extensionForAudioMimeType(mimeType),
    bytes: input.size,
  };
}

/**
 * Sustituye caracteres de control, colapsa el espacio en blanco y acota la
 * longitud de la transcripción devuelta por el proveedor.
 */
export function sanitizeTranscript(raw: string | null | undefined): string {
  let cleaned = "";
  for (const character of String(raw ?? "")) {
    const code = character.codePointAt(0) ?? 32;
    cleaned += code < 32 || code === 127 ? " " : character;
  }
  return cleaned.replace(/\s+/g, " ").trim().slice(0, VOICE_MAX_TRANSCRIPT_CHARS);
}

/** Mensajes de rechazo en castellano. El cliente no inventa texto. */
export const VOICE_REJECTION_MESSAGES: Record<VoiceRejectionReason, string> = {
  EMPTY_AUDIO: "No he recibido audio. Mantén el Orbe grabando mientras hablas.",
  AUDIO_TOO_LARGE:
    "El mensaje de voz supera el límite. Divide la explicación en dos mensajes más cortos.",
  UNSUPPORTED_AUDIO_TYPE:
    "Este navegador ha enviado un formato de audio que no acepto. Puedes escribir el mensaje.",
  TRANSCRIPT_EMPTY: "No he podido entender el audio. Repítelo más cerca del micrófono.",
};
