"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LivingGoldenOrb } from "@/components/LivingGoldenOrb";
import { emitOrb } from "@/lib/orb-events";
import { VOICE_MAX_SECONDS } from "@/lib/voice";
import type { ExtractedField, OrbState } from "@/types/domain";

type Turn = { role: "user" | "assistant"; text: string };

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

const fieldLabels: Record<string, string> = {
  business_description: "Actividad descrita",
  preferred_legal_form: "Forma jurídica preferida",
  number_of_founders: "Número de fundadores",
  physical_premises: "Local físico",
  online_activity: "Actividad online",
  municipality: "Municipio",
  administrator_structure: "Órgano de administración",
  administrator_paid: "Cargo retribuido",
};

function displayValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value === null || value === undefined || value === "") return "Pendiente";
  return String(value);
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Conversación por mensaje de voz.
 *
 * El navegador graba, el servidor transcribe y la transcripción entra en la
 * misma tubería de ingesta que las notas de voz de WhatsApp. Nada de esto
 * ocurre sin sesión: la ruta del servidor vuelve a comprobarlo.
 */
export function VoiceConversation({
  onClose,
  projectId,
  title = "Habla con el Orbe",
}: {
  onClose: () => void;
  projectId?: string;
  title?: string;
}) {
  const router = useRouter();
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState("Pulsa el Orbe y explica qué empresa quieres crear.");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [fields, setFields] = useState<ExtractedField[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Al desmontar el panel el audio en curso se descarta: cerrar no envía.
  const discardRef = useRef(false);

  const transition = useCallback((state: OrbState, message: string) => {
    setOrbState(state);
    emitOrb({ action: "voice", intensity: state === "manifesting" ? "high" : "medium", state, message });
  }, []);

  const releaseMicrophone = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
    setIsRecording(false);
  }, []);

  const send = useCallback(
    async (audio: Blob) => {
      setIsProcessing(true);
      transition("thinking", "Transcribiendo tu mensaje de voz");
      setNotice("Transcribiendo y ordenando lo que has dicho…");
      try {
        const body = new FormData();
        body.append("audio", audio, "mensaje-de-voz");
        if (projectId) body.append("projectId", projectId);
        const response = await fetch("/api/agent/voice", { method: "POST", body });
        const payload = (await response.json().catch(() => ({}))) as {
          transcript?: string;
          message?: string;
          suggestedNextQuestion?: string;
          extractedFields?: ExtractedField[];
          persistence?: string;
          error?: string;
        };

        if (response.status === 401 || response.status === 403) {
          transition("blocked", "Se requiere sesión de Google");
          setNotice(payload.message ?? "Inicia sesión con Google para usar el canal de voz.");
          router.push("/acceso?next=%2Fapp%3Fvoz%3D1");
          return;
        }
        if (!response.ok) {
          transition("warning", "No he podido procesar el audio");
          setNotice(payload.message ?? "No he podido procesar el mensaje de voz.");
          return;
        }

        transition("validating", "Comprobando los datos extraídos");
        setTurns((current) => [
          ...current,
          { role: "user", text: payload.transcript ?? "(sin transcripción)" },
          {
            role: "assistant",
            text: `${payload.message ?? ""} ${payload.suggestedNextQuestion ?? ""}`.trim(),
          },
        ]);
        setFields(payload.extractedFields ?? []);
        setNotice(
          payload.persistence === "PERSISTED"
            ? "Mensaje registrado en tu expediente con trazabilidad."
            : "Mensaje procesado. La persistencia no está disponible en este entorno.",
        );
        window.setTimeout(() => setOrbState("idle"), 1_600);
      } catch {
        transition("warning", "Fallo de red");
        setNotice("No he podido enviar el audio. Revisa la conexión e inténtalo de nuevo.");
      } finally {
        setIsProcessing(false);
      }
    },
    [projectId, router, transition],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) {
      stopRecording();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      transition("warning", "Micrófono no disponible");
      setNotice("Este navegador no permite grabar audio. Puedes escribir el mensaje en el panel.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (discardRef.current) return;
        releaseMicrophone();
        if (blob.size > 0) void send(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setSeconds(0);
      transition("listening", "Escuchando tu explicación");
      setNotice("Te escucho. Vuelve a pulsar el Orbe cuando termines.");
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => {
          const next = current + 1;
          if (next >= VOICE_MAX_SECONDS) stopRecording();
          return next;
        });
      }, 1_000);
    } catch {
      releaseMicrophone();
      transition("blocked", "Permiso de micrófono denegado");
      setNotice("Necesito permiso del micrófono para escucharte. Puedes concederlo y reintentar.");
    }
  }, [isProcessing, isRecording, releaseMicrophone, send, stopRecording, transition]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /**
   * Al cerrar el panel se libera el micrófono sin tocar el estado de React:
   * el componente ya no está montado y el audio pendiente se descarta.
   */
  useEffect(() => {
    const timers = timerRef;
    const stream = streamRef;
    const recorder = recorderRef;
    const discard = discardRef;
    return () => {
      discard.current = true;
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      if (timers.current !== null) window.clearInterval(timers.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button
        className="voice-overlay__scrim"
        type="button"
        aria-label="Cerrar la conversación de voz"
        onClick={onClose}
      />
      <section className="voice-panel">
        <header className="voice-panel__head">
          <span className="eyebrow">ORBE · MENSAJE DE VOZ</span>
          <button ref={closeRef} className="voice-close" type="button" onClick={onClose}>
            Cerrar <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className="voice-panel__orb">
          <LivingGoldenOrb state={orbState} onActivate={() => void startRecording()} />
        </div>

        <p className="voice-panel__notice" aria-live="polite">
          {notice}
        </p>

        <div className="voice-panel__controls">
          <button
            className={`gold-button gold-button--small ${isRecording ? "is-recording" : ""}`}
            type="button"
            onClick={() => void startRecording()}
            disabled={isProcessing}
          >
            {isRecording
              ? `Detener y enviar · ${String(seconds).padStart(2, "0")}s`
              : isProcessing
                ? "Procesando…"
                : "Grabar mensaje de voz"}
          </button>
          <a className="text-button" href="/app#orbe">
            Prefiero escribirlo
          </a>
        </div>

        {turns.length > 0 && (
          <div className="voice-log" aria-live="polite">
            {turns.slice(-4).map((turn, index) => (
              <div className={`message message--${turn.role}`} key={`${turn.role}-${index}`}>
                <span>{turn.role === "assistant" ? "ORBE" : "TÚ"}</span>
                <p>{turn.text}</p>
              </div>
            ))}
          </div>
        )}

        {fields.length > 0 && (
          <section className="voice-fields" aria-label="Datos detectados en el mensaje de voz">
            <div className="voice-fields__title">
              <span>DATOS DETECTADOS</span>
              <small>{fields.length} campos · pendientes de tu confirmación</small>
            </div>
            <dl>
              {fields.map((field) => (
                <div key={field.field}>
                  <dt>{fieldLabels[field.field] ?? field.field}</dt>
                  <dd>{displayValue(field.value)}</dd>
                  <span className={`risk-tag risk-tag--${field.risk.toLowerCase()}`}>
                    {field.risk.replace("_", " ")}
                  </span>
                </div>
              ))}
            </dl>
            <a className="gold-button gold-button--small" href="/app#orbe">
              Revisar y confirmar en el expediente <span aria-hidden="true">↗</span>
            </a>
          </section>
        )}

        <p className="voice-panel__legal">
          Información orientativa. No sustituye asesoramiento profesional. El audio no se
          almacena: se transcribe y se descarta.
        </p>
      </section>
    </div>
  );
}
