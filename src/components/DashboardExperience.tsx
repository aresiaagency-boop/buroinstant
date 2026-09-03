"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { HexagonalGravityField } from "@/components/HexagonalGravityField";
import { LivingGoldenOrb } from "@/components/LivingGoldenOrb";
import { VoiceConversation } from "@/components/VoiceConversation";
import { emitOrb } from "@/lib/orb-events";
import type { ActivityClassification } from "@/lib/activity-classifier";
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

/**
 * Los cinco datos que abren el diagnóstico.
 *
 * Cada uno lleva la pregunta tal y como se la haría una persona a otra, por qué
 * importa, y —cuando la respuesta es una decisión cerrada— las opciones reales.
 * Preguntar con opciones evita el problema que tenía antes esta pantalla: media
 * frase suelta en el campo de conversación acababa guardada en el campo
 * equivocado.
 */
type CaseFieldOption = { value: string | number | boolean; label: string };

type CaseField = {
  key: string;
  label: string;
  question: string;
  why: string;
  type: "text" | "choice";
  placeholder?: string;
  options?: CaseFieldOption[];
};

const caseFields: CaseField[] = [
  {
    key: "business_description",
    label: "Actividad",
    question: "¿Qué va a vender tu empresa, a quién y desde dónde?",
    why: "Con esto reconozco el sector y sé qué hay que comprobar en sede oficial.",
    type: "text",
    placeholder: "Ej.: desarrollo de software a medida para empresas, desde Palma",
  },
  {
    key: "preferred_legal_form",
    label: "Forma jurídica",
    question: "¿Cómo quieres constituirla?",
    why: "Decide si hay que pasar por notaría y Registro Mercantil, y cómo cotizas.",
    type: "choice",
    options: [
      { value: "SL", label: "Sociedad Limitada (SL)" },
      { value: "SLU", label: "SL unipersonal (SLU)" },
      { value: "AUTONOMO", label: "Autónomo, sin sociedad" },
      { value: "SIN_DECIDIR", label: "Todavía no lo sé" },
    ],
  },
  {
    key: "number_of_founders",
    label: "Fundadores",
    question: "¿Cuántas personas vais a fundarla?",
    why: "Con un solo socio la sociedad es unipersonal y hay que declararlo.",
    type: "choice",
    options: [
      { value: 1, label: "Solo yo" },
      { value: 2, label: "Dos" },
      { value: 3, label: "Tres" },
      { value: 4, label: "Más de tres" },
    ],
  },
  {
    key: "municipality",
    label: "Municipio",
    question: "¿En qué municipio va a estar la empresa?",
    why: "El ayuntamiento resuelve las licencias, y las tasas cambian de uno a otro.",
    type: "text",
    placeholder: "Ej.: Palma de Mallorca",
  },
  {
    key: "physical_premises",
    label: "Local físico",
    question: "¿Vas a tener un local abierto al público o a terceros?",
    why: "Con local entran la licencia de apertura y, según la actividad, sanidad.",
    type: "choice",
    options: [
      { value: true, label: "Sí, tendré local" },
      { value: false, label: "No, trabajaré sin local" },
    ],
  },
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
  const [section, setSection] = useState("orbe");
  const [answering, setAnswering] = useState<CaseField | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [activity, setActivity] = useState<ActivityClassification | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [sourceState, setSourceState] = useState<{
    status: "IDLE" | "CHECKING" | "VERIFIED" | "UNAVAILABLE";
    checkedAt: string | null;
  }>({ status: "IDLE", checkedAt: null });
  const [notice, setNotice] = useState(
    configuration.database
      ? "Expediente conectado a PostgreSQL"
      : "Modo local: configura PostgreSQL para persistencia compartida",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
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

  /** Lleva la vista a una sección. Los enlaces con # no bastan aquí. */
  function goTo(id: string) {
    setSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Abre la respuesta de un dato concreto.
   *
   * Antes esto metía media frase en el campo de conversación y el extractor
   * adivinaba a qué campo pertenecía: "La empresa estará en Palma" acababa
   * guardado como actividad. Ahora la persona responde a una pregunta concreta
   * y el valor va al campo que se le ha preguntado, sin adivinar nada.
   */
  function startAnswer(field: CaseField) {
    setAnswering(field);
    setAnswerDraft(field.type === "text" ? String(profile[field.key] ?? "") : "");
    setSection("orbe");
    transition("listening", `Esperando: ${field.label.toLowerCase()}`);
    setNotice(field.why);
    window.setTimeout(() => {
      document.getElementById("respuesta-dirigida")?.scrollIntoView({ behavior: "smooth", block: "center" });
      answerRef.current?.focus();
    }, 60);
  }

  function saveAnswer(field: CaseField, value: unknown) {
    const nextProfile = { ...profile, [field.key]: value };
    setProfile(nextProfile);
    if (actor.mode === "local_preview") {
      window.localStorage.setItem("buroinstant.preview.profile", JSON.stringify(nextProfile));
    }
    setAnswering(null);
    setAnswerDraft("");
    setMessages((current) => [
      ...current,
      { role: "user", text: `${field.label}: ${displayValue(value)}` },
      {
        role: "assistant",
        text: `Anotado en tu expediente. ${
          caseFields.find((item) => {
            const stored = nextProfile[item.key];
            return stored === undefined || stored === null || stored === "";
          })
            ? "Sigo con el siguiente dato que hace falta."
            : "Ya tengo los cinco datos: puedo clasificar la actividad y preparar la ruta."
        }`,
      },
    ]);
    transition("manifesting", `${field.label} incorporado`);
    setNotice(`${field.label} guardado en el expediente.`);
    window.setTimeout(() => {
      transition("success", "Dato incorporado");
      window.setTimeout(() => setOrbState("idle"), 1_200);
    }, 500);
  }

  /**
   * Clasifica la actividad descrita. El resultado nunca trae epígrafe ni CNAE:
   * trae el sector reconocido y la lista de lo que hay que comprobar en sede.
   */
  async function classify() {
    const description = String(profile.business_description ?? "").trim();
    if (!description || classifying) return;
    setClassifying(true);
    transition("thinking", "Clasificando la actividad");
    try {
      const response = await fetch("/api/activity/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          municipality: (profile.municipality as string | undefined) ?? null,
          hasPremises: typeof profile.physical_premises === "boolean" ? profile.physical_premises : null,
          onlineActivity: typeof profile.online_activity === "boolean" ? profile.online_activity : null,
        }),
      });
      if (!response.ok) {
        transition("warning", "No he podido clasificar la actividad");
        setNotice("No he podido clasificar la actividad. Descríbela con algo más de detalle.");
        return;
      }
      const result = (await response.json()) as ActivityClassification;
      setActivity(result);
      transition(result.sector === "SIN_DETERMINAR" ? "blocked" : "validating", "Actividad clasificada");
      setNotice(
        result.sector === "SIN_DETERMINAR"
          ? "Tu descripción todavía no encaja en un sector. Cuéntame algo más."
          : `Actividad reconocida como ${result.sectorLabel}. Falta comprobar ${result.obligationsToVerify.length} puntos en sede oficial.`,
      );
      window.setTimeout(() => setOrbState("idle"), 1_600);
    } catch {
      transition("warning", "Fallo de red al clasificar");
    } finally {
      setClassifying(false);
    }
  }

  /** Comprueba en vivo que la sede de la AEAT responde ahora mismo. */
  async function checkOfficialSource() {
    setSourceState({ status: "CHECKING", checkedAt: null });
    transition("consulting_official_source", "Consultando la sede de la AEAT");
    try {
      const response = await fetch("/api/official-sources/search?q=empresa%20censal%20036");
      const payload = (await response.json()) as {
        results?: Array<{ status?: string; fetchedAt?: string | null }>;
      };
      const verified = (payload.results ?? []).find((entry) => entry.status === "VERIFIED");
      if (!response.ok || !verified) {
        setSourceState({ status: "UNAVAILABLE", checkedAt: new Date().toISOString() });
        transition("warning", "La sede oficial no responde");
        setNotice("La sede oficial no responde ahora. No doy nada por bueno sin comprobarlo.");
        return;
      }
      setSourceState({ status: "VERIFIED", checkedAt: verified.fetchedAt ?? new Date().toISOString() });
      transition("success", "Fuente oficial verificada");
      setNotice("Fuente oficial verificada en este momento.");
      window.setTimeout(() => setOrbState("idle"), 1_600);
    } catch {
      setSourceState({ status: "UNAVAILABLE", checkedAt: new Date().toISOString() });
      transition("warning", "No he podido alcanzar la sede oficial");
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
  const firstPending = caseFields.find((field) => {
    const value = profile[field.key];
    return value === undefined || value === null || value === "";
  });
  const nextStep = firstPending
    ? {
        title: firstPending.key === "business_description" ? "Describe tu actividad" : `Falta: ${firstPending.label.toLowerCase()}`,
        body:
          firstPending.key === "business_description"
            ? "Empieza explicando qué vas a ofrecer, a quién y desde dónde operarás."
            : "Es el siguiente dato que desbloquea el diagnóstico de tu expediente.",
        cta: firstPending.key === "business_description" ? "Empezar ahora" : "Responder ahora",
        field: firstPending,
      }
    : {
        title: "Listo para el diagnóstico",
        body: "Ya tengo los datos mínimos. Pídeme el diagnóstico y contrasto la ruta con la fuente oficial.",
        cta: "Clasificar mi actividad",
        field: null as CaseField | null,
      };
  const sourceLabel =
    sourceState.status === "VERIFIED"
      ? `Verificada ${new Date(sourceState.checkedAt ?? Date.now()).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
      : sourceState.status === "UNAVAILABLE"
        ? "No responde ahora mismo"
        : sourceState.status === "CHECKING"
          ? "Comprobando la sede…"
          : "Sin consulta en vivo todavía";

  return (
    <main className="dashboard-shell">
      <HexagonalGravityField />
      <aside className="dashboard-nav" aria-label="Navegación principal">
        <BrandMark compact />
        <nav>
          {[
            { id: "orbe", icono: "⌾", texto: "Orbe" },
            { id: "expediente", icono: "◇", texto: "Expediente" },
            { id: "tareas", icono: "✓", texto: "Paso" },
            { id: "actividad", icono: "◈", texto: "Actividad" },
            { id: "fuentes", icono: "§", texto: "AEAT" },
            { id: "trazabilidad", icono: "▱", texto: "Traza" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item nav-item--button ${section === item.id ? "is-active" : ""}`}
              onClick={() => goTo(item.id)}
              aria-label={item.texto}
              aria-current={section === item.id ? "true" : undefined}
            >
              <span>{item.icono}</span><small>{item.texto}</small>
            </button>
          ))}
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

            {answering && (
              <section className="answer-card" id="respuesta-dirigida" aria-label={`Responder: ${answering.label}`}>
                <div className="answer-card__head">
                  <span>{answering.label.toUpperCase()}</span>
                  <button type="button" className="text-button text-button--tiny" onClick={() => setAnswering(null)}>
                    Cancelar
                  </button>
                </div>
                <h3>{answering.question}</h3>
                <p className="answer-card__why">{answering.why}</p>

                {answering.type === "choice" ? (
                  <div className="answer-card__options">
                    {(answering.options ?? []).map((option) => (
                      <button
                        key={String(option.value)}
                        type="button"
                        className="answer-option"
                        onClick={() => saveAnswer(answering, option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <form
                    className="answer-card__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = answerDraft.trim();
                      if (value.length < 2) return;
                      saveAnswer(answering, value);
                    }}
                  >
                    <input
                      ref={answerRef}
                      value={answerDraft}
                      onChange={(event) => setAnswerDraft(event.target.value)}
                      placeholder={answering.placeholder}
                      aria-label={answering.question}
                    />
                    <button className="send-button" type="submit" disabled={answerDraft.trim().length < 2}>
                      Guardar <span aria-hidden="true">↗</span>
                    </button>
                  </form>
                )}
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
              <h2>{nextStep.title}</h2>
              <p>{nextStep.body}</p>
              <button
                type="button"
                className="gold-button gold-button--small"
                onClick={() => (nextStep.field ? startAnswer(nextStep.field) : (goTo("actividad"), void classify()))}
              >
                {nextStep.cta} <span aria-hidden="true">↗</span>
              </button>
              <span className="action-time">≈ 3 min · Requiere tu confirmación</span>
            </section>

            <section className="case-summary">
              <div className="section-heading">
                <h2>Expediente vivo</h2>
                <span>{confirmedCount} datos confirmados</span>
              </div>
              <dl>
                {caseFields.map((field) => {
                  const value = profile[field.key];
                  const pending = value === undefined || value === null || value === "";
                  return (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>
                        {pending ? (
                          <button
                            type="button"
                            className={`pending-button ${answering?.key === field.key ? "is-answering" : ""}`}
                            onClick={() => startAnswer(field)}
                          >
                            Pendiente <span aria-hidden="true">→</span>
                          </button>
                        ) : (
                          <button type="button" className="confirmed-value" onClick={() => startAnswer(field)} title="Cambiar este dato">
                            {displayValue(value)}
                          </button>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="case-summary__hint">
                Pulsa un dato y te hago la pregunta concreta. Lo que respondas se
                guarda en ese dato, no en otro.
              </p>
            </section>

            <section className="activity-card" id="actividad">
              <div className="section-heading">
                <h2>Actividad</h2>
                <span>{activity ? `confianza ${Math.round(activity.confidence * 100)}%` : "sin clasificar"}</span>
              </div>

              {!activity && (
                <div className="activity-card__intro">
                  <p>
                    Traduce lo que has contado de tu negocio a la lengua de la
                    Administración: qué sector es, y qué te va a pedir cada
                    organismo por serlo.
                  </p>
                  <ul>
                    <li><strong>Cómo</strong> — reconoce el sector por tus propias palabras y lo cruza con lo que ya hay en el expediente: local, socios, contratación, ventas fuera de España.</li>
                    <li><strong>Qué te devuelve</strong> — la lista de trámites que te tocan, cada uno con la sede oficial donde se comprueba.</li>
                    <li><strong>Qué resuelve</strong> — dejar de adivinar. Sabes qué papeles vas a necesitar antes de pisar una notaría.</li>
                  </ul>
                  <p className="activity-card__warn">
                    El epígrafe de IAE y el código CNAE no los deduzco: se consultan
                    en la sede y los confirmas tú antes de que entren al expediente.
                  </p>
                  {!profile.business_description && (
                    <p className="activity-card__warn">
                      Necesito primero tu actividad. Pulsa «Actividad» en el
                      expediente y te la pregunto.
                    </p>
                  )}
                </div>
              )}

              {activity && (
                <>
                  <strong className="activity-card__sector">{activity.sectorLabel}</strong>
                  {activity.evidence.length > 0 && (
                    <p className="activity-card__evidence">
                      Por lo que has dicho: {activity.evidence.slice(0, 4).join(", ")}
                    </p>
                  )}
                  <p className={`activity-card__flag activity-card__flag--${activity.regulatoryExposure === "REQUIERE_COMPROBACION" ? "check" : "clear"}`}>
                    {activity.regulatoryReason}
                  </p>

                  {activity.obligationsToVerify.length > 0 && (
                    <ol className="activity-card__list">
                      {activity.obligationsToVerify.map((item) => (
                        <li key={item.topic}>
                          <strong>{item.topic}</strong>
                          <span>{item.why}</span>
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                            {item.authority} <span aria-hidden="true">↗</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  )}

                  <p className="activity-card__result">
                    {activity.obligationsToVerify.length} trámites que te tocan por
                    ser {activity.sectorLabel.toLowerCase()}, cada uno con su sede.
                    Ninguno se da por bueno hasta comprobarlo.
                  </p>
                  <p className="activity-card__codes">{activity.codesNote}</p>

                  {activity.nextQuestions.length > 0 && (
                    <button
                      type="button"
                      className="text-button text-button--tiny"
                      onClick={() => firstPending && startAnswer(firstPending)}
                    >
                      {activity.nextQuestions[0]}
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                className="gold-button gold-button--small"
                onClick={() => void classify()}
                disabled={classifying || !profile.business_description}
              >
                {classifying ? "Clasificando…" : activity ? "Volver a clasificar" : "Clasificar actividad"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </section>

            <section className="official-source" id="fuentes">
              <div className="source-seal" aria-hidden="true">AEAT</div>
              <div>
                <span>FUENTE PRIMARIA</span>
                <strong>Centro AEAT Empresas</strong>
                <small>{sourceLabel}</small>
                <button type="button" className="text-button text-button--tiny" onClick={() => void checkOfficialSource()} disabled={sourceState.status === "CHECKING"}>
                  {sourceState.status === "CHECKING" ? "Comprobando…" : "Comprobar ahora"}
                </button>
              </div>
              <a
                href="https://sede.agenciatributaria.gob.es/Sede/empresas.html"
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir Centro AEAT Empresas"
              >↗</a>
            </section>

            <section className="trust-note" id="trazabilidad">
              <span>TRAZABILIDAD ACTIVA</span>
              <p>Cada dato conserva canal, riesgo, estado de confirmación y fecha de entrada.</p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
