"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { HexagonalGravityField } from "@/components/HexagonalGravityField";
import { LivingGoldenOrb } from "@/components/LivingGoldenOrb";
import { VoiceConversation } from "@/components/VoiceConversation";
import { emitOrb } from "@/lib/orb-events";
import type { Actor, ExtractedField, OrbState } from "@/types/domain";

type ChatMessage = { role: "user" | "assistant"; text: string };
type Profile = Record<string, unknown>;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

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

const phaseLabels = [
  "Idea",
  "Diagnóstico",
  "Estructura",
  "Preparación",
  "Constitución",
  "Registro",
  "Alta fiscal",
  "Seguridad Social",
  "Operativa",
];

function displayValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value === null || value === undefined || value === "") return "Pendiente";
  return String(value);
}

export function DashboardExperience({
  actor,
  configuration,
  openVoiceOnMount = false,
}: {
  actor: Actor;
  configuration: { database: boolean; googleOAuth: boolean };
  openVoiceOnMount?: boolean;
}) {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [voiceOpen, setVoiceOpen] = useState(openVoiceOnMount);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [profile, setProfile] = useState<Profile>({});
  const [pendingFields, setPendingFields] = useState<ExtractedField[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Cuéntame qué empresa quieres crear. Puedes hablar con naturalidad; yo convertiré la conversación en datos estructurados.",
    },
  ]);
  const [notice, setNotice] = useState(
    configuration.database
      ? "Expediente conectado a PostgreSQL"
      : "Modo local: configura PostgreSQL para persistencia compartida",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (actor.mode !== "local_preview") return;
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("buroinstant.preview.profile");
      if (saved) {
        try {
          setProfile(JSON.parse(saved) as Profile);
        } catch {
          window.localStorage.removeItem("buroinstant.preview.profile");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [actor.mode]);

  function transition(state: OrbState, message: string) {
    setOrbState(state);
    emitOrb({ action: "conversation", intensity: state === "manifesting" ? "high" : "medium", state, message });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    setMessages((current) => [...current, { role: "user", text }]);
    setInput("");
    setIsSending(true);
    transition("thinking", "Ordenando tu intención");

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, inputType: "TEXT" }),
      });
      const result = (await response.json()) as {
        message?: string;
        suggestedNextQuestion?: string;
        extractedFields?: ExtractedField[];
        persistence?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "REQUEST_FAILED");
      transition("validating", "Comprobando los datos extraídos");
      setPendingFields(result.extractedFields ?? []);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: `${result.message ?? "He procesado tu mensaje"} ${result.suggestedNextQuestion ?? ""}`.trim(),
        },
      ]);
      setNotice(
        result.persistence === "PERSISTED"
          ? "Entrada registrada con trazabilidad"
          : "Entrada procesada en modo local",
      );
    } catch {
      transition("warning", "No se pudo procesar el mensaje");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "No he podido procesar esta entrada. Puedes reintentar sin perder lo que ya está confirmado.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function confirmFields() {
    const additions = Object.fromEntries(pendingFields.map((field) => [field.field, field.value]));
    const nextProfile = { ...profile, ...additions };
    setProfile(nextProfile);
    if (actor.mode === "local_preview") {
      window.localStorage.setItem("buroinstant.preview.profile", JSON.stringify(nextProfile));
    }
    setPendingFields([]);
    transition("manifesting", "Incorporando datos al expediente");
    window.setTimeout(() => {
      transition("success", "Datos incorporados");
      setNotice("Datos confirmados e incorporados al expediente");
      window.setTimeout(() => setOrbState("idle"), 1_600);
    }, 720);
  }

  function correctFields() {
    setPendingFields([]);
    setNotice("Describe la corrección en el campo de conversación");
    transition("blocked", "Esperando tu corrección");
    inputRef.current?.focus();
  }

  /**
   * El Orbe abre el canal de mensaje de voz: el audio se transcribe en el
   * servidor y entra en la misma tubería que las notas de voz de WhatsApp.
   * En demostración local ese canal no existe, así que queda el dictado del
   * navegador, que nunca sale del dispositivo.
   */
  function activateOrb() {
    if (actor.mode === "oauth") {
      setVoiceOpen(true);
      return;
    }
    startListening();
  }

  function startListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setOrbState("idle");
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      transition("warning", "La voz no está disponible en este navegador");
      setNotice("El navegador no ofrece reconocimiento de voz. Puedes escribir el mensaje.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "es-ES";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setInput(transcript);
    };
    recognition.onerror = () => {
      transition("warning", "No he podido escuchar con claridad");
      setNotice("Revisa el permiso del micrófono o escribe tu mensaje.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setOrbState("idle");
      inputRef.current?.focus();
    };
    recognitionRef.current = recognition;
    transition("listening", "Escuchando tu explicación");
    recognition.start();
  }

  const confirmedCount = Object.keys(profile).length;
  const phaseIndex = confirmedCount >= 4 ? 1 : 0;

  return (
    <main className="dashboard-shell">
      <HexagonalGravityField />
      <aside className="dashboard-nav" aria-label="Navegación principal">
        <BrandMark compact />
        <nav>
          <a className="nav-item is-active" href="#orbe" aria-label="Orbe"><span>⌾</span><small>Orbe</small></a>
          <a className="nav-item" href="#expediente" aria-label="Proyecto"><span>◇</span><small>Proyecto</small></a>
          <a className="nav-item" href="#tareas" aria-label="Trámites"><span>✓</span><small>Trámites</small></a>
          <a className="nav-item" href="#fuentes" aria-label="AEAT"><span>§</span><small>AEAT</small></a>
          <a className="nav-item" href="#documentos" aria-label="Documentos"><span>▱</span><small>Docs</small></a>
        </nav>
        <form action="/api/auth/logout" method="post">
          <button className="nav-item nav-item--button" type="submit" aria-label="Cerrar sesión">
            <span>↙</span><small>Salir</small>
          </button>
        </form>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">EXPEDIENTE EMPRESARIAL ÚNICO</p>
            <h1>Buenos días, {actor.name.split(" ")[0]}</h1>
          </div>
          <div className="header-state">
            <span className={configuration.database ? "system-dot is-on" : "system-dot"} />
            <div>
              <strong>{configuration.database ? "Sistema conectado" : "Configuración incompleta"}</strong>
              <small>{actor.mode === "local_preview" ? "Demostración local" : actor.email}</small>
            </div>
          </div>
        </header>

        <div className="phase-line" aria-label={`Fase ${phaseIndex + 1} de ${phaseLabels.length}`}>
          <div className="phase-line__lead">
            <small>Tu empresa está en</small>
            <strong>Fase {phaseIndex + 1} de {phaseLabels.length} · {phaseLabels[phaseIndex]}</strong>
          </div>
          <div className="phase-track">
            {phaseLabels.map((phase, index) => (
              <span key={phase} className={index <= phaseIndex ? "is-current" : ""} title={phase} />
            ))}
          </div>
          <span className="phase-percent">{Math.round(((phaseIndex + 1) / phaseLabels.length) * 100)}%</span>
        </div>

        <div className="dashboard-grid">
          <section className="orbe-console" id="orbe">
            <div className="orbe-console__heading">
              <span>ORBE / INTÉRPRETE OPERATIVO</span>
              <span className="secure-label">● SESIÓN SEGURA</span>
            </div>
            <div className="orb-command-center">
              <LivingGoldenOrb state={orbState} onActivate={activateOrb} />
              <div className="orb-copy">
                <p>Expresa una intención.</p>
                <strong>Yo la convierto en un siguiente paso verificable.</strong>
                <button className="text-button" type="button" onClick={activateOrb}>
                  {actor.mode === "oauth"
                    ? "Pulsa el Orbe para enviar un mensaje de voz"
                    : "Pulsa el Orbe para dictar (demostración local)"}
                </button>
              </div>
            </div>

            <div className="conversation-log" aria-live="polite">
              {messages.slice(-3).map((message, index) => (
                <div className={`message message--${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === "assistant" ? "ORBE" : "TÚ"}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>

            {pendingFields.length > 0 && (
              <section className="confirmation-panel" aria-label="Confirmar datos extraídos">
                <div className="confirmation-panel__title">
                  <span>VALIDACIÓN HUMANA REQUERIDA</span>
                  <small>{pendingFields.length} campos detectados</small>
                </div>
                <dl>
                  {pendingFields.map((field) => (
                    <div key={field.field}>
                      <dt>{fieldLabels[field.field] ?? field.field}</dt>
                      <dd>{displayValue(field.value)}</dd>
                      <span className={`risk-tag risk-tag--${field.risk.toLowerCase()}`}>{field.risk.replace("_", " ")}</span>
                    </div>
                  ))}
                </dl>
                <div className="confirmation-actions">
                  <button type="button" className="gold-button gold-button--small" onClick={confirmFields}>Confirmar e incorporar</button>
                  <button type="button" className="text-button" onClick={correctFields}>Corregir</button>
                </div>
              </section>
            )}

            <form className="command-input" onSubmit={handleSubmit}>
              <button
                className={`voice-button ${orbState === "listening" ? "is-listening" : ""}`}
                type="button"
                onClick={startListening}
                aria-label={orbState === "listening" ? "Detener escucha" : "Hablar con BUROINSTANT"}
              >
                {orbState === "listening" ? "■" : "◉"}
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ej.: Quiero crear una SL de software en Palma…"
                aria-label="Describe qué empresa quieres crear"
              />
              <button className="send-button" type="submit" disabled={isSending || !input.trim()}>
                {isSending ? "Procesando" : "Manifestar"} <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="console-notice">{notice}</p>
            {voiceOpen && <VoiceConversation onClose={() => setVoiceOpen(false)} />}
          </section>

          <aside className="case-rail" id="expediente">
            <section className="next-action" id="tareas">
              <p className="eyebrow">PRÓXIMO PASO</p>
              <h2>{confirmedCount ? "Completar los datos iniciales" : "Describe tu actividad"}</h2>
              <p>
                {confirmedCount
                  ? "Faltan las decisiones mínimas para generar un diagnóstico con contexto suficiente."
                  : "Empieza explicando qué vas a ofrecer, a quién y desde dónde operarás."}
              </p>
              <span className="action-time">≈ 3 min · Requiere tu confirmación</span>
            </section>

            <section className="case-summary">
              <div className="section-heading">
                <h2>Expediente vivo</h2>
                <span>{confirmedCount} datos confirmados</span>
              </div>
              <dl>
                <div><dt>Actividad</dt><dd>{displayValue(profile.business_description)}</dd></div>
                <div><dt>Forma jurídica</dt><dd>{displayValue(profile.preferred_legal_form)}</dd></div>
                <div><dt>Fundadores</dt><dd>{displayValue(profile.number_of_founders)}</dd></div>
                <div><dt>Municipio</dt><dd>{displayValue(profile.municipality)}</dd></div>
                <div><dt>Local físico</dt><dd>{displayValue(profile.physical_premises)}</dd></div>
              </dl>
            </section>

            <section className="official-source" id="fuentes">
              <div className="source-seal" aria-hidden="true">AEAT</div>
              <div>
                <span>FUENTE PRIMARIA</span>
                <strong>Centro AEAT Empresas</strong>
                <small>Sin consulta en vivo todavía</small>
              </div>
              <a
                href="https://sede.agenciatributaria.gob.es/Sede/empresas.html"
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir Centro AEAT Empresas"
              >↗</a>
            </section>

            <section className="trust-note" id="documentos">
              <span>TRAZABILIDAD ACTIVA</span>
              <p>Cada dato conserva canal, riesgo, estado de confirmación y fecha de entrada.</p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
