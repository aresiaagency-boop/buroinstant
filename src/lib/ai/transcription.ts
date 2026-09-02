import { extensionForAudioMimeType, sanitizeTranscript } from "@/lib/voice";

/**
 * Transcripción de mensajes de voz. Se ejecuta SIEMPRE en el servidor: la
 * clave del proveedor nunca sale de aquí, nunca se registra y nunca viaja al
 * navegador. El mismo modelo que el workflow INGESTA_BUROINSTANT usa para las
 * notas de voz de WhatsApp atiende el canal web, de modo que la conversación
 * es una sola sin importar por dónde entre.
 */

const TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-1";
const REQUEST_TIMEOUT_MS = 60_000;

export class TranscriptionNotConfiguredError extends Error {
  constructor() {
    super("TRANSCRIPTION_NOT_CONFIGURED");
    this.name = "TranscriptionNotConfiguredError";
  }
}

export class TranscriptionFailedError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("TRANSCRIPTION_FAILED");
    this.name = "TranscriptionFailedError";
    this.status = status;
  }
}

export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function transcriptionModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_MODEL;
}

export interface TranscriptionResult {
  text: string;
  model: string;
}

export async function transcribeAudio(input: {
  audio: Blob;
  mimeType: string;
  language?: string;
}): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TranscriptionNotConfiguredError();

  const model = transcriptionModel();
  const form = new FormData();
  form.append("file", input.audio, `mensaje-de-voz.${extensionForAudioMimeType(input.mimeType)}`);
  form.append("model", model);
  form.append("language", input.language ?? "es");
  form.append("response_format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      // El cuerpo del error puede contener eco de la petición: no se registra.
      throw new TranscriptionFailedError(response.status);
    }
    const payload = (await response.json()) as { text?: unknown };
    return { text: sanitizeTranscript(typeof payload.text === "string" ? payload.text : ""), model };
  } finally {
    clearTimeout(timeout);
  }
}
