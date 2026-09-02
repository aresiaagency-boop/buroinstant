import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { BusinessDataIngestionService } from "@/lib/ingestion";
import { persistIngestion } from "@/lib/repository";
import { inboundMessageSchema } from "@/lib/schemas";
import { checkEphemeralRateLimit } from "@/lib/security/rate-limit";
import {
  isTranscriptionConfigured,
  transcribeAudio,
  TranscriptionFailedError,
  TranscriptionNotConfiguredError,
} from "@/lib/ai/transcription";
import {
  VOICE_MAX_BYTES,
  VOICE_REJECTION_MESSAGES,
  sanitizeTranscript,
  validateVoiceUpload,
} from "@/lib/voice";

/**
 * Canal de mensaje de voz del Orbe.
 *
 * Reglas de acceso, en este orden y siempre en el servidor:
 *   1. Sesión Google real. El modo de demostración local no abre este canal:
 *      la voz entra en el expediente y el expediente pertenece a una persona
 *      identificada.
 *   2. Límite de peticiones por usuario.
 *   3. Validación del audio antes de gastar transcripción.
 *
 * El audio no se almacena. Se transcribe, la transcripción entra en la misma
 * tubería de ingesta que usa WhatsApp y el audio se descarta al terminar la
 * petición.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const service = new BusinessDataIngestionService();

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) {
    return NextResponse.json(
      {
        error: "GOOGLE_SESSION_REQUIRED",
        message: "Inicia sesión con Google para hablar con el Orbe.",
      },
      { status: 401 },
    );
  }
  if (actor.mode !== "oauth") {
    return NextResponse.json(
      {
        error: "GOOGLE_SESSION_REQUIRED",
        message:
          "El canal de voz requiere una cuenta de Google. La demostración local solo admite texto.",
      },
      { status: 403 },
    );
  }

  const limit = checkEphemeralRateLimit(`voice:${actor.userId}`, {
    limit: 12,
    windowMs: 5 * 60 * 1_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Demasiados mensajes de voz seguidos. Espera un momento antes de continuar.",
      },
      { status: 429 },
    );
  }

  if (!isTranscriptionConfigured()) {
    return NextResponse.json(
      {
        error: "VOICE_TRANSCRIPTION_NOT_CONFIGURED",
        message:
          "El canal de voz no está configurado en este entorno. Escribe el mensaje y quedará registrado igual.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json(
      { error: "EMPTY_AUDIO", message: VOICE_REJECTION_MESSAGES.EMPTY_AUDIO },
      { status: 400 },
    );
  }

  const validation = validateVoiceUpload({ size: audio.size, type: audio.type });
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.reason,
        message: VOICE_REJECTION_MESSAGES[validation.reason],
        maxBytes: VOICE_MAX_BYTES,
      },
      { status: validation.reason === "AUDIO_TOO_LARGE" ? 413 : 400 },
    );
  }

  let transcript: string;
  try {
    const result = await transcribeAudio({ audio, mimeType: validation.mimeType });
    transcript = sanitizeTranscript(result.text);
  } catch (error) {
    if (error instanceof TranscriptionNotConfiguredError) {
      return NextResponse.json({ error: "VOICE_TRANSCRIPTION_NOT_CONFIGURED" }, { status: 503 });
    }
    const status = error instanceof TranscriptionFailedError ? 502 : 500;
    return NextResponse.json(
      {
        error: "TRANSCRIPTION_FAILED",
        message: "No he podido transcribir el audio. Vuelve a intentarlo o escribe el mensaje.",
      },
      { status },
    );
  }

  if (transcript.length < 2) {
    return NextResponse.json(
      { error: "TRANSCRIPT_EMPTY", message: VOICE_REJECTION_MESSAGES.TRANSCRIPT_EMPTY },
      { status: 422 },
    );
  }

  const rawProjectId = form.get("projectId");
  const projectId =
    typeof rawProjectId === "string" && /^[0-9a-f-]{36}$/i.test(rawProjectId)
      ? rawProjectId
      : undefined;

  const message = inboundMessageSchema.parse({
    channel: "WEB",
    inputType: "VOICE",
    userId: /^[0-9a-f-]{36}$/i.test(actor.userId) ? actor.userId : undefined,
    projectId,
    text: transcript,
    sourceTimestamp: new Date().toISOString(),
  });

  const result = service.process(message);
  let persistence: "PERSISTED" | "LOCAL_PREVIEW" | "FAILED" = "LOCAL_PREVIEW";
  if (isDatabaseConfigured()) {
    try {
      await persistIngestion({ actor, message, fields: result.extractedFields, projectId });
      persistence = "PERSISTED";
    } catch {
      persistence = "FAILED";
    }
  }

  return NextResponse.json({
    ...result,
    transcript,
    persistence,
    message:
      result.extractedFields.length > 0
        ? "He escuchado tu mensaje y lo he convertido en datos del expediente. Revísalos antes de incorporarlos."
        : "He escuchado tu mensaje. Necesito una precisión más para avanzar.",
    informationalOnly: true,
  });
}
