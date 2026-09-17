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

/** Los dos plazos que arrancan con la certificación del RMC. */
type PlazosRmc = {
  expedidaEl: string;
  limiteEscritura: string;
  limiteReserva: string;
};

type ProyectoListado = {
  id: string;
  name: string;
  caseStage: string;
  updatedAt: string;
  archivado: boolean;
};

/** Una fila del calendario de obligaciones, tal como la sirve la ruta. */
type ObligationRow = {
  code: string;
  obligationCode: string;
  model: string | null;
  title: string;
  detail: string;
  authority: string;
  periodicity: string;
  responsible: string;
  periodLabel: string;
  dueDate: string | null;
  windowRule: string;
  sourceUrl: string;
  sourceTitle: string;
  pendingVerification?: string;
  shiftNote?: string;
  limitNote?: string;
  anchorNote?: string;
  urgency: "SIN_FECHA" | "LEJANO" | "PROXIMO" | "INMINENTE" | "VENCIDO";
};

type CalendarPayload = {
  project: { id: string; name: string } | null;
  from?: string;
  horizonDays?: number;
  legalFormDecided?: boolean;
  obligations: ObligationRow[];
  /** Las que tienen fecha: de éstas avisa BUROINSTANT. */
  conFecha?: ObligationRow[];
  /** Las que no la tienen: de éstas no puede avisar, y hay que decirlo. */
  sinFecha?: ObligationRow[];
  sinFechaAviso?: string | null;
  message?: string;
  footer?: string;
};

/** El archivo de documentos, tal como lo sirve la ruta. */
type VaultRequirement = {
  category: string;
  categoryLabel: string;
  title: string;
  why: string;
  required: boolean;
  satisfied: boolean;
};

type VaultDocument = {
  id: string;
  category: string;
  categoryLabel: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  reviewStatus: string;
  createdAt: string;
};

type VaultPayload = {
  project: { id: string; name: string } | null;
  encryptionReady?: boolean;
  canUpload?: boolean;
  maxBytes?: number;
  requirements: VaultRequirement[];
  documents: VaultDocument[];
  message?: string;
};

/** 51200 → «50 KB». Sin decimales: aquí sólo importa el orden de magnitud. */
function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Un trámite del itinerario con los documentos que lo acreditan. */
type ItineraryTask = {
  code: string;
  title: string;
  detail: string;
  authority: string;
  status: string;
  priority: number;
  verificationMethod: string;
  sourceUrl?: string;
  pendingVerification?: string;
  documents: Array<{ id: string; displayName: string; categoryLabel: string; sizeBytes: number }>;
  confirmable: boolean;
};

type ItineraryPayload = {
  project: { id: string; name: string } | null;
  canConfirm?: boolean;
  tasks: ItineraryTask[];
  message?: string;
};

/**
 * La carpeta de presentación de un trámite: lo que hay que llevar, lo que ya
 * está, y lo que falta. No dice que el trámite esté hecho ni lo presenta.
 */
type CarpetaVista = {
  code: string;
  title: string;
  siguientePaso: string;
  listoParaPresentar: boolean;
  datos: Array<{ campo: string; etiqueta: string; valor: string }>;
  faltan: Array<{ campo: string; etiqueta: string; comoSeConsigue: string }>;
  papelesAportados: Array<{ category: string; etiqueta: string; documentId?: string; nombre?: string }>;
  papelesQueFaltan: Array<{ category: string; etiqueta: string }>;
  bloqueadoPor: Array<{ code: string; title: string; estado: string }>;
  advertencias: string[];
};

const TASK_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Sin empezar",
  WAITING_USER: "Te toca a ti",
  READY: "Puedes hacerlo ya",
  IN_PROGRESS: "Documento aportado",
  WAITING_AUTHORITY: "Esperando a la Administración",
  COMPLETED: "Hecho",
  BLOCKED: "Bloqueado",
  NOT_APPLICABLE: "No aplica",
};

const RESPONSIBLE_LABEL: Record<string, string> = {
  AUTONOMO: "Tú, como autónomo",
  EMPRESA: "La empresa",
  ADMINISTRADOR: "El administrador",
};

const URGENCY_LABEL: Record<string, string> = {
  VENCIDO: "Ya vencido",
  INMINENTE: "Esta semana",
  PROXIMO: "Este mes",
  LEJANO: "Más adelante",
  SIN_FECHA: "Fecha por confirmar",
};

/**
 * Una fila del calendario. Es la misma en las dos listas —con fecha y sin
 * fecha— a propósito: lo que cambia es dónde está, no cómo se lee.
 */
function ObligationItem({ item }: { item: ObligationRow }) {
  return (
    <li className={`calendar-row calendar-row--${item.urgency.toLowerCase()}`}>
      <div className="calendar-row__when">
        <strong>{item.dueDate ? fechaLarga(item.dueDate) : "Por confirmar"}</strong>
        <small>{URGENCY_LABEL[item.urgency]}</small>
      </div>
      <div className="calendar-row__what">
        <strong>
          {item.model ? `Modelo ${item.model} · ` : ""}
          {item.title}
        </strong>
        <span className="calendar-row__period">{item.periodLabel}</span>
        <p>{item.detail}</p>
        <p className="calendar-row__rule">{item.windowRule}</p>
        {item.limitNote && <p className="calendar-row__pending">{item.limitNote}</p>}
        {item.anchorNote && <p className="calendar-row__rule">{item.anchorNote}</p>}
        {item.pendingVerification && <p className="calendar-row__pending">{item.pendingVerification}</p>}
        {item.shiftNote && <p className="calendar-row__shift">{item.shiftNote}</p>}
        <div className="calendar-row__meta">
          <span>{RESPONSIBLE_LABEL[item.responsible] ?? item.responsible}</span>
          <span>{item.authority}</span>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            {item.sourceTitle} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </li>
  );
}

/** 2026-10-20 → «20 de octubre de 2026». Sin Date, para no depender del huso. */
function fechaLarga(iso: string): string {
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} de ${meses[month - 1]} de ${year}`;
}

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
  const [projectId, setProjectId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Array<{ field: string; value: unknown; channel: string }>>([]);
  const [linkState, setLinkState] = useState<{
    status: string;
    code?: string;
    maskedPhone?: string;
    instructions?: string;
    businessNumberLabel?: string | null;
    waLink?: string | null;
  } | null>(null);
  const [persistence, setPersistence] = useState<"LOCAL" | "SAVING" | "SAVED" | "FAILED">("LOCAL");
  const [section, setSection] = useState("orbe");
  const [answering, setAnswering] = useState<CaseField | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [activity, setActivity] = useState<ActivityClassification | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [calendar, setCalendar] = useState<CalendarPayload | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [loadingVault, setLoadingVault] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryPayload | null>(null);
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [confirmingTask, setConfirmingTask] = useState<string | null>(null);
  const [carpeta, setCarpeta] = useState<CarpetaVista | null>(null);
  const [carpetaCargando, setCarpetaCargando] = useState<string | null>(null);
  // Las cinco del Registro Mercantil Central. Cinco casillas fijas porque el
  // RMC admite cinco: la forma del formulario dice la regla sin explicarla.
  const [denominaciones, setDenominaciones] = useState<string[]>(["", "", "", "", ""]);
  const [concedida, setConcedida] = useState<number | null>(null);
  const [certificadaEl, setCertificadaEl] = useState("");
  const [plazosRmc, setPlazosRmc] = useState<PlazosRmc | null>(null);
  const [guardandoRmc, setGuardandoRmc] = useState(false);
  const [proyectos, setProyectos] = useState<ProyectoListado[] | null>(null);
  const [archivando, setArchivando] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCategoryRef = useRef<string>("OTHER");
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

  /**
   * Al entrar se recupera el expediente guardado. Antes los cinco datos vivían
   * solo en el navegador y se perdían al refrescar.
   */
  useEffect(() => {
    if (actor.mode !== "oauth" || !configuration.database) return;
    let cancelado = false;
    void (async () => {
      try {
        const response = await fetch("/api/expediente", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          project?: { id: string; profile: Record<string, unknown> } | null;
          proposals?: Array<{ field: string; value: unknown; channel: string }>;
        };
        if (cancelado) return;
        setProposals(payload.proposals ?? []);
        if (!payload.project) return;
        const limpio = Object.fromEntries(
          Object.entries(payload.project.profile).filter(([, value]) => value !== undefined && value !== null),
        );
        setProjectId(payload.project.id);
        setProfile(limpio);
        setPersistence("SAVED");
        if (Object.keys(limpio).length > 0) {
          setNotice("Expediente recuperado. Continúa donde lo dejaste.");
        }
      } catch {
        // Recuperar el expediente no puede impedir usar el panel.
      }
      try {
        const estado = await fetch("/api/expediente/whatsapp", { cache: "no-store" });
        if (!cancelado && estado.ok) setLinkState(await estado.json());
      } catch {
        // El estado de vinculación no puede impedir usar el panel.
      }
      if (!cancelado) {
        // Las denominaciones y la lista de expedientes se traen con el resto:
        // son parte de lo que la persona dejó a medias, no una pantalla aparte.
        await cargarDenominaciones();
        await cargarProyectos();

        // Y se vuelve al sitio donde lo dejó. Se hace al final, cuando las
        // secciones ya tienen contenido: moverse a un bloque vacío deja la
        // vista en un sitio que luego cambia de sitio al llegar los datos.
        try {
          const guardada = window.localStorage.getItem(claveDeSeccion());
          if (guardada) {
            setSection(guardada);
            window.setTimeout(() => {
              document.getElementById(guardada)?.scrollIntoView({ behavior: "auto", block: "start" });
            }, 120);
          }
        } catch {
          // Sin almacenamiento se empieza por el orbe, como siempre.
        }
      }
    })();
    return () => {
      cancelado = true;
    };
    // Este efecto corre una vez al abrir el panel. `cargarDenominaciones` y
    // `cargarProyectos` se redefinen en cada render, así que incluirlas en las
    // dependencias repetiría la carga en bucle sin que nada haya cambiado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor.mode, configuration.database]);

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

  /**
   * El extractor de reglas de siempre, como red.
   *
   * Sin clave de proveedor no se finge un asesor: se dice que el razonamiento
   * no está disponible y se sigue sacando datos de la frase, que es lo que
   * BUROINSTANT sabía hacer antes y sigue sabiendo.
   */
  async function enviarPorReglas(text: string, aviso?: string) {
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
    setNotice(aviso ?? "Entrada procesada sin razonamiento: falta la clave del proveedor de IA.");
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
      /*
       * Primero el asesor: entiende una instrucción cualquiera con el
       * expediente delante. Si no hay proveedor de IA configurado, se cae al
       * extractor de reglas de siempre —que es peor, pero contesta— en vez de
       * dejar el orbe mudo.
       */
      const response = await fetch("/api/agent/asesor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          ...(projectId ? { projectId } : {}),
          historial: messages.slice(-8).map((m) => ({ rol: m.role, texto: m.text })),
        }),
      });
      const result = (await response.json()) as {
        texto?: string;
        propuestas?: Array<{ field: string; value: unknown; porque: string }>;
        comprobar?: string[];
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        if (result.error === "AI_PROVIDER_NOT_CONFIGURED") {
          await enviarPorReglas(text, result.message);
          return;
        }
        throw new Error(result.error ?? "REQUEST_FAILED");
      }

      transition("validating", "Contrastando con tu expediente");

      // Las propuestas entran en la misma bandeja de confirmación que ya
      // existía: el asesor propone, la persona confirma. Un dato con
      // consecuencia legal no se aplica porque lo diga un chat.
      setPendingFields(
        (result.propuestas ?? []).map((propuesta) => ({
          field: propuesta.field,
          value: propuesta.value,
          confidence: 0.8,
          risk: "MEDIUM_RISK" as const,
          status: "NEEDS_CONFIRMATION" as const,
          requiresConfirmation: true,
          source: "WEB_TEXT" as const,
        })),
      );

      const comprobar = (result.comprobar ?? []).filter((c) => c.trim().length > 0);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: [
            result.texto ?? "No he podido componer una respuesta.",
            comprobar.length > 0 ? `\n\nAntes de actuar, comprueba: ${comprobar.join(" · ")}` : "",
          ]
            .join("")
            .trim(),
        },
      ]);
      setNotice(
        (result.propuestas ?? []).length > 0
          ? `${result.propuestas!.length} cambios propuestos. Revísalos antes de incorporarlos.`
          : "Respondido sobre tu expediente.",
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

  /**
   * Lleva la vista a una sección, y la recuerda.
   *
   * Antes, refrescar devolvía a todo el mundo al principio: estabas en el
   * archivo subiendo papeles, recargabas, y aparecías en el orbe. El sitio
   * donde dejaste el expediente es parte del expediente.
   *
   * Se guarda por cuenta —la clave lleva el identificador de quien entra—, así
   * que dos personas en el mismo navegador no se pisan la posición.
   */
  function goTo(id: string) {
    setSection(id);
    recordarSeccion(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function claveDeSeccion() {
    return `buroinstant:seccion:${actor.email || actor.userId || "anonimo"}`;
  }

  function recordarSeccion(id: string) {
    try {
      window.localStorage.setItem(claveDeSeccion(), id);
    } catch {
      // Navegación privada o almacenamiento bloqueado: se pierde la posición,
      // que es molesto, no grave. Nunca puede impedir usar el panel.
    }
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

  /**
   * Las cinco denominaciones que se piden al Registro Mercantil Central.
   *
   * Existían en el expediente pero no había forma de escribirlas desde aquí: la
   * ruta estaba y el panel no. Una función a la que sólo se llega por consola no
   * existe para quien usa la aplicación.
   */
  async function cargarDenominaciones() {
    if (actor.mode !== "oauth" || !configuration.database) return;
    try {
      const payload = await fetch("/api/expediente/denominaciones", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null,
      );
      if (!payload) return;
      const casillas = ["", "", "", "", ""];
      let cual: number | null = null;
      for (const item of payload.denominaciones ?? []) {
        casillas[item.position - 1] = item.name;
        if (item.status === "GRANTED") cual = item.position;
      }
      setDenominaciones(casillas);
      setConcedida(cual);
      setPlazosRmc(payload.plazos ?? null);
      if (payload.plazos?.expedidaEl) setCertificadaEl(payload.plazos.expedidaEl);
    } catch {
      // Una lectura que falla no rompe el panel: se queda como estaba.
    }
  }

  async function guardarDenominaciones() {
    setGuardandoRmc(true);
    try {
      const lista = denominaciones
        .map((name, indice) => ({ name: name.trim(), posicion: indice + 1 }))
        .filter((item) => item.name.length >= 2)
        .map((item) => ({
          name: item.name,
          status: concedida === item.posicion ? ("GRANTED" as const) : ("PROPOSED" as const),
        }));

      const response = await fetch("/api/expediente/denominaciones", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ denominaciones: lista }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(payload?.message ?? "No he podido guardar las denominaciones.");
        return;
      }

      // La fecha de certificación va con el perfil, no con la lista.
      const fecha = certificadaEl.trim();
      if (fecha === "" || /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        await fetch("/api/expediente", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(projectId ? { projectId } : {}),
            denomination_certified_at: fecha === "" ? null : fecha,
          }),
        });
      }

      await cargarDenominaciones();
      setNotice(
        lista.length === 0
          ? "Lista vacía guardada. Sin denominaciones, el trámite del RMC no se puede presentar."
          : `${lista.length} denominaciones guardadas, por orden de preferencia.`,
      );
    } catch {
      setNotice("Sin conexión. No he podido guardar las denominaciones.");
    } finally {
      setGuardandoRmc(false);
    }
  }

  async function cargarProyectos() {
    if (actor.mode !== "oauth" || !configuration.database) return;
    try {
      const payload = await fetch("/api/expediente/archivar", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null,
      );
      if (payload?.proyectos) setProyectos(payload.proyectos as ProyectoListado[]);
    } catch {
      // Igual que arriba: una lectura fallida no cambia nada.
    }
  }

  async function archivarProyecto(id: string, archivado: boolean) {
    setArchivando(id);
    try {
      const response = await fetch("/api/expediente/archivar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: id, archivado }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(payload?.message ?? "No he podido cambiar el estado del expediente.");
        return;
      }
      if (payload?.proyectos) setProyectos(payload.proyectos as ProyectoListado[]);
      setNotice(
        archivado
          ? "Expediente archivado. No se ha borrado nada: sigue ahí, sólo deja de contar como abierto."
          : "Expediente recuperado.",
      );
    } catch {
      setNotice("Sin conexión. No he podido cambiar el estado del expediente.");
    } finally {
      setArchivando(null);
    }
  }

  /**
   * Trae el calendario de obligaciones del expediente. Es una lectura: no
   * escribe nada, así que puede pedirse las veces que haga falta.
   */
  async function loadCalendar() {
    if (actor.mode !== "oauth" || !configuration.database) {
      setNotice("El calendario necesita una sesión real de Google y la base de datos configurada.");
      return;
    }
    setLoadingCalendar(true);
    try {
      const response = await fetch("/api/expediente/obligaciones?dias=365", { cache: "no-store" });
      if (!response.ok) {
        setNotice("No he podido construir el calendario. Vuelve a intentarlo.");
        return;
      }
      const payload = (await response.json()) as CalendarPayload;
      setCalendar(payload);
      const conFecha = (payload.conFecha ?? payload.obligations.filter((item) => item.dueDate)).length;
      const sinFecha = (payload.sinFecha ?? payload.obligations.filter((item) => !item.dueDate)).length;
      setNotice(
        payload.obligations.length === 0
          ? (payload.message ?? "Todavía no hay obligaciones que calcular.")
          : sinFecha === 0
            ? `${conFecha} obligaciones con fecha en los próximos doce meses. Te aviso de todas.`
            : `${conFecha} obligaciones con fecha, de las que te aviso. ${sinFecha} sin fecha cerrada: ésas las compruebas tú.`,
      );
    } catch {
      setNotice("Sin conexión. No he podido construir el calendario.");
    } finally {
      setLoadingCalendar(false);
    }
  }

  /** Lee el archivo: qué papeles pide el expediente y cuáles ya están. */
  async function loadVault() {
    if (actor.mode !== "oauth" || !configuration.database) {
      setNotice("El archivo necesita una sesión real de Google y la base de datos configurada.");
      return;
    }
    setLoadingVault(true);
    try {
      const response = await fetch("/api/expediente/documentos", { cache: "no-store" });
      if (!response.ok) {
        setNotice("No he podido leer el archivo de documentos.");
        return;
      }
      const payload = (await response.json()) as VaultPayload;
      setVault(payload);
      const faltan = payload.requirements.filter((r) => !r.satisfied).length;
      setNotice(
        payload.requirements.length === 0
          ? (payload.message ?? "Todavía no sé qué papeles pedirte.")
          : faltan === 0
            ? "Tienes en el archivo todo lo que el expediente pide ahora mismo."
            : `Te faltan ${faltan} documentos por aportar.`,
      );
    } catch {
      setNotice("Sin conexión. No he podido leer el archivo.");
    } finally {
      setLoadingVault(false);
    }
  }

  /** Lee el itinerario con los documentos que acreditan cada trámite. */
  async function loadItinerary() {
    if (actor.mode !== "oauth" || !configuration.database) {
      setNotice("El itinerario necesita una sesión real de Google y la base de datos configurada.");
      return;
    }
    setLoadingItinerary(true);
    try {
      const response = await fetch("/api/expediente/tramites", { cache: "no-store" });
      if (!response.ok) {
        setNotice("No he podido leer el itinerario.");
        return;
      }
      const payload = (await response.json()) as ItineraryPayload;
      setItinerary(payload);
      const hechos = payload.tasks.filter((t) => t.status === "COMPLETED").length;
      setNotice(
        payload.tasks.length === 0
          ? (payload.message ?? "Todavía no hay itinerario que construir.")
          : `${hechos} de ${payload.tasks.length} trámites hechos con evidencia.`,
      );
    } catch {
      setNotice("Sin conexión. No he podido leer el itinerario.");
    } finally {
      setLoadingItinerary(false);
    }
  }

  /** Da un trámite por hecho apoyándose en el documento ya aportado. */
  /**
   * Abre la carpeta de presentación de un trámite. Pulsar sobre la que ya está
   * abierta la cierra: es una hoja, no una pestaña más que gestionar.
   */
  async function abrirCarpeta(task: ItineraryTask) {
    if (carpeta?.code === task.code) {
      setCarpeta(null);
      return;
    }
    setCarpetaCargando(task.code);
    try {
      const response = await fetch(`/api/expediente/tramites/${encodeURIComponent(task.code)}/dossier`);
      if (!response.ok) {
        setNotice("No he podido preparar la carpeta de ese trámite.");
        return;
      }
      const payload = (await response.json()) as { carpeta?: CarpetaVista };
      if (!payload.carpeta) {
        setNotice("No he podido preparar la carpeta de ese trámite.");
        return;
      }
      setCarpeta(payload.carpeta);
    } catch {
      setNotice("Sin conexión. No he podido preparar la carpeta.");
    } finally {
      setCarpetaCargando(null);
    }
  }

  async function confirmTask(task: ItineraryTask) {
    setConfirmingTask(task.code);
    try {
      const response = await fetch("/api/expediente/tramites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskCode: task.code }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.message ?? "No he podido dar ese trámite por hecho.");
        return;
      }
      setNotice(payload.message ?? "Trámite dado por hecho.");
      await loadItinerary();
    } catch {
      setNotice("Sin conexión. El trámite sigue como estaba.");
    } finally {
      setConfirmingTask(null);
    }
  }

  /** Abre el selector de archivos recordando a qué requisito responde. */
  function pickDocument(category: string) {
    pendingCategoryRef.current = category;
    fileInputRef.current?.click();
  }

  async function uploadDocument(file: File) {
    const category = pendingCategoryRef.current;
    setUploadingCategory(category);
    setNotice(`Cifrando y guardando ${file.name}…`);
    try {
      const cuerpo = new FormData();
      cuerpo.append("file", file);
      cuerpo.append("category", category);
      const response = await fetch("/api/expediente/documentos", { method: "POST", body: cuerpo });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.message ?? "No he podido guardar ese documento.");
        return;
      }
      setNotice(payload.message ?? "Guardado.");
      await loadVault();
      // El papel puede haber movido un trámite: si el itinerario está a la
      // vista, se refresca para que se vea el cambio.
      if (itinerary) await loadItinerary();
    } catch {
      setNotice("Sin conexión. El documento no se ha guardado.");
    } finally {
      setUploadingCategory(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function requestLinkCode() {
    setNotice("Pidiendo el código de vinculación…");
    try {
      const response = await fetch("/api/expediente/whatsapp", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.message ?? "No he podido emitir el código.");
        return;
      }
      setLinkState(payload);
      setNotice("Envía el código por WhatsApp desde el teléfono que quieras vincular.");
    } catch {
      setNotice("Sin conexión. No he podido emitir el código.");
    }
  }

  /** Guarda el dato en el expediente. En cuenta real, contra PostgreSQL. */
  async function persistAnswer(field: CaseField, value: unknown) {
    if (actor.mode !== "oauth" || !configuration.database) return;
    setPersistence("SAVING");
    try {
      const response = await fetch("/api/expediente", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(projectId ? { projectId } : {}), [field.key]: value }),
      });
      if (!response.ok) {
        setPersistence("FAILED");
        setNotice("El dato no se ha podido guardar en el expediente. Vuelve a intentarlo.");
        return;
      }
      const payload = (await response.json()) as { project?: { id: string } };
      if (payload.project?.id) setProjectId(payload.project.id);
      setPersistence("SAVED");
    } catch {
      setPersistence("FAILED");
      setNotice("Sin conexión con el expediente. El dato no se ha guardado.");
    }
  }

  function saveAnswer(field: CaseField, value: unknown) {
    const nextProfile = { ...profile, [field.key]: value };
    setProfile(nextProfile);
    if (actor.mode === "local_preview") {
      window.localStorage.setItem("buroinstant.preview.profile", JSON.stringify(nextProfile));
    } else {
      void persistAnswer(field, value);
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
            { id: "calendario", icono: "▤", texto: "Plazos" },
            { id: "archivo", icono: "⛁", texto: "Archivo" },
            { id: "itinerario", icono: "⇢", texto: "Ruta" },
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
                <span className={`persistence persistence--${persistence.toLowerCase()}`}>
                  {persistence === "SAVING"
                    ? "guardando…"
                    : persistence === "SAVED"
                      ? `${confirmedCount} datos guardados`
                      : persistence === "FAILED"
                        ? "sin guardar"
                        : `${confirmedCount} datos · solo en este navegador`}
                </span>
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

            {proposals.length > 0 && (
              <section className="proposals-card" aria-label="Propuestas pendientes de confirmar">
                <div className="section-heading">
                  <h2>Llegó por WhatsApp</h2>
                  <span>{proposals.length} sin confirmar</span>
                </div>
                <p className="proposals-card__why">
                  Estos datos tienen consecuencia legal, así que no entran en el
                  expediente porque se hayan dicho de pasada en un mensaje.
                </p>
                <ul>
                  {proposals.map((proposal) => {
                    const field = caseFields.find((item) => item.key === proposal.field);
                    return (
                      <li key={proposal.field}>
                        <div>
                          <strong>{field?.label ?? proposal.field}</strong>
                          <span>{displayValue(proposal.value)}</span>
                        </div>
                        <button
                          type="button"
                          className="gold-button gold-button--small"
                          onClick={() => field && saveAnswer(field, proposal.value)}
                        >
                          Confirmar
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="proposals-card__hint">
                  Si no es correcto, responde ese dato desde el expediente y la
                  propuesta desaparece.
                </p>
              </section>
            )}

            {actor.mode === "oauth" && configuration.database && (
              <section className="link-card" aria-label="WhatsApp del expediente">
                <div className="section-heading">
                  <h2>WhatsApp</h2>
                  <span>{linkState?.status === "LINKED" ? "vinculado" : "sin vincular"}</span>
                </div>
                {linkState?.status === "LINKED" ? (
                  <>
                    <p className="link-card__ok">
                      <strong>{linkState.maskedPhone}</strong> ya escribe en este
                      expediente.
                    </p>
                    <p className="link-card__steps">
                      Desde ese teléfono puedes escribir o mandar un audio a
                      {linkState.businessNumberLabel ? ` ${linkState.businessNumberLabel}` : " BUROINSTANT"}{" "}
                      y lo que cuentes entra aquí. Los datos claros se guardan solos;
                      los que comprometen algo —forma jurídica, socios, municipio—
                      te esperan arriba para que los confirmes.
                    </p>
                  </>
                ) : linkState?.status === "PENDING" ? (
                  <>
                    <p className="link-card__code">{linkState.code}</p>
                    <p className="link-card__steps">{linkState.instructions}</p>
                    {linkState.waLink ? (
                      <a
                        className="gold-button gold-button--small"
                        href={linkState.waLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir WhatsApp con el mensaje escrito <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <p className="link-card__warn">
                        Falta configurar el número de WhatsApp de BUROINSTANT en el
                        servidor. Sin él no puedo decirte a dónde enviar el código.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="link-card__steps">
                      <strong>Para qué sirve:</strong> para no depender de estar
                      delante del ordenador. Vinculas tu móvil una vez y a partir de
                      ahí avanzas el expediente hablando o escribiendo por WhatsApp
                      {linkState?.businessNumberLabel ? ` a ${linkState.businessNumberLabel}` : ""}.
                    </p>
                    <p className="link-card__steps">
                      <strong>Cómo funciona:</strong> te doy un código de seis
                      caracteres y lo envías tú desde el teléfono que quieras
                      vincular. Que el mensaje llegue desde ese número es la prueba
                      de que es tuyo; por eso no te pido que lo teclees en un
                      formulario, donde cualquiera podría poner el de otro.
                    </p>
                    <button type="button" className="gold-button gold-button--small" onClick={() => void requestLinkCode()}>
                      Pedir código <span aria-hidden="true">↗</span>
                    </button>
                  </>
                )}
              </section>
            )}

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

            <section className="calendar-card" id="calendario">
              <div className="section-heading">
                <h2>Calendario de obligaciones</h2>
                <span>
                  {calendar
                    ? `${(calendar.conFecha ?? calendar.obligations.filter((item) => item.dueDate)).length} con fecha`
                    : "sin calcular"}
                </span>
              </div>

              {!calendar && (
                <div className="calendar-card__intro">
                  <p>
                    Crear la empresa es el principio. Esto es lo que viene
                    después: cada obligación con su modelo, su plazo, quién
                    responde de ella y la sede oficial donde se comprueba.
                  </p>
                  <ul>
                    <li><strong>Cómo</strong> — parte de lo que ya has respondido: forma jurídica, si hay local y si vas a contratar. Cada respuesta añade o retira obligaciones.</li>
                    <li><strong>Qué te devuelve</strong> — las fechas de los próximos doce meses, ordenadas, y las que todavía no puedo cerrar dichas como tales.</li>
                    <li><strong>Qué resuelve</strong> — que no te enteres de un plazo el día después. Un recargo por presentar tarde se paga aunque la declaración salga a cero.</li>
                  </ul>
                  <p className="calendar-card__warn">
                    Sólo traslado los vencimientos que caen en sábado o domingo.
                    Los festivos autonómicos y locales no están aplicados: la
                    fecha de la sede manda sobre la mía.
                  </p>
                </div>
              )}

              {calendar && calendar.legalFormDecided === false && (
                <p className="calendar-card__warn">
                  Aún no has decidido la forma jurídica. Este calendario es el
                  común a cualquier actividad; en cuanto la elijas cambia, porque
                  una sociedad y un autónomo no presentan lo mismo.
                </p>
              )}

              {calendar && calendar.obligations.length === 0 && (
                <p className="calendar-card__warn">{calendar.message ?? "Todavía no hay nada que calcular."}</p>
              )}

              {calendar && (calendar.conFecha ?? calendar.obligations).length > 0 && (
                <ol className="calendar-card__list">
                  {(calendar.conFecha ?? calendar.obligations).map((item) => (
                    <ObligationItem key={item.code} item={item} />
                  ))}
                </ol>
              )}

              {/* Las que no tienen fecha van aparte, y con el motivo delante: de
                  éstas BUROINSTANT no avisa, así que responde quien las lee. */}
              {calendar && (calendar.sinFecha?.length ?? 0) > 0 && (
                <div className="calendar-card__undated">
                  <h3>Sin fecha · de éstas no puedo avisarte</h3>
                  <p className="calendar-card__warn">
                    {calendar.sinFechaAviso ??
                      "Estas obligaciones no tienen fecha cerrada, así que el aviso de los diez, tres y un día antes no puede calcularse. Compruébalas en la sede oficial enlazada."}
                  </p>
                  <ol className="calendar-card__list">
                    {calendar.sinFecha!.map((item) => (
                      <ObligationItem key={item.code} item={item} />
                    ))}
                  </ol>
                </div>
              )}

              {calendar?.footer && <p className="calendar-card__footer">{calendar.footer}</p>}

              <button
                type="button"
                className="gold-button gold-button--small"
                onClick={() => void loadCalendar()}
                disabled={loadingCalendar}
              >
                {loadingCalendar ? "Calculando…" : calendar ? "Volver a calcular" : "Calcular mis plazos"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </section>

            <section className="vault-card" id="archivo">
              <div className="section-heading">
                <h2>Archivo de documentos</h2>
                <span>
                  {vault
                    ? `${vault.requirements.filter((r) => r.satisfied).length}/${vault.requirements.length} aportados`
                    : "sin abrir"}
                </span>
              </div>

              {!vault && (
                <div className="vault-card__intro">
                  <p>
                    El sitio donde vive el papeleo del expediente: DNI,
                    denominación, estatutos, escritura, alta censal. Cada
                    documento con el trámite al que responde.
                  </p>
                  <ul>
                    <li><strong>Cómo</strong> — la lista sale de lo que ya has respondido: un autónomo no tiene que aportar estatutos ni escritura, una SL sí, y la licencia sólo se pide si has dicho que hay local.</li>
                    <li><strong>Qué te devuelve</strong> — qué te falta, qué ya está, y la descarga de cada uno cuando la notaría o el banco te lo pidan.</li>
                    <li><strong>Qué resuelve</strong> — llegar a la notaría con todo, y no volver a buscar la escritura en el correo dentro de dos años.</li>
                  </ul>
                  <p className="vault-card__warn">
                    Cada archivo se cifra con una clave propia antes de tocar la
                    base de datos. Quien lea la base de datos no obtiene ningún
                    documento: la clave maestra no está ahí.
                  </p>
                </div>
              )}

              {vault && vault.encryptionReady === false && (
                <p className="vault-card__warn">
                  El cifrado no está configurado en el servidor, así que el
                  archivo no acepta documentos. Antes que guardar un DNI en
                  claro, prefiero no guardarlo.
                </p>
              )}

              {vault && vault.requirements.length === 0 && (
                <p className="vault-card__warn">{vault.message ?? "Todavía no sé qué papeles pedirte."}</p>
              )}

              {vault && vault.requirements.length > 0 && (
                <ol className="vault-card__list">
                  {vault.requirements.map((requisito) => {
                    const aportados = vault.documents.filter((d) => d.category === requisito.category);
                    return (
                      <li
                        key={requisito.category}
                        className={`vault-row ${requisito.satisfied ? "vault-row--ok" : "vault-row--pending"}`}
                      >
                        <div className="vault-row__head">
                          <strong>{requisito.title}</strong>
                          <span>{requisito.satisfied ? "Aportado" : requisito.required ? "Falta" : "Opcional"}</span>
                        </div>
                        <p className="vault-row__why">{requisito.why}</p>

                        {aportados.length > 0 && (
                          <ul className="vault-row__files">
                            {aportados.map((documento) => (
                              <li key={documento.id}>
                                <a
                                  href={`/api/expediente/documentos/${documento.id}`}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {documento.displayName} <span aria-hidden="true">↓</span>
                                </a>
                                <small>{tamanoLegible(documento.sizeBytes)}</small>
                              </li>
                            ))}
                          </ul>
                        )}

                        <button
                          type="button"
                          className="text-button text-button--tiny"
                          onClick={() => pickDocument(requisito.category)}
                          disabled={vault.canUpload === false || vault.encryptionReady === false || uploadingCategory !== null}
                        >
                          {uploadingCategory === requisito.category
                            ? "Cifrando…"
                            : aportados.length > 0
                              ? "Añadir otro"
                              : "Subir documento"}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}

              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.docx,.xlsx"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadDocument(file);
                }}
              />

              <button
                type="button"
                className="gold-button gold-button--small"
                onClick={() => void loadVault()}
                disabled={loadingVault}
              >
                {loadingVault ? "Abriendo…" : vault ? "Actualizar el archivo" : "Abrir mi archivo"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </section>

            {/* El primer trámite real de una sociedad. Hasta ahora las cinco
                denominaciones vivían fuera del expediente y la carpeta salía
                sin ellas: se imprimía, se llegaba al RMC y había que buscarlas
                en otro sitio. */}
            <section className="calendar-card" id="denominaciones">
              <div className="section-heading">
                <h2>Denominaciones para el Registro Mercantil</h2>
                <span>{denominaciones.filter((d) => d.trim().length >= 2).length}/5</span>
              </div>

              <p className="calendar-card__warn">
                Se piden hasta cinco en una sola solicitud, por orden de preferencia: el Registro
                concede la primera que esté libre. Se guardan tal y como las escribas — las reglas de
                composición las aplica el RMC, y corregirlas aquí pediría un nombre distinto del que
                quieres.
              </p>

              <ol className="calendar-card__list">
                {denominaciones.map((valor, indice) => (
                  <li key={indice} className="calendar-row">
                    <div className="calendar-row__when">
                      <strong>{indice + 1}ª</strong>
                      <small>{concedida === indice + 1 ? "concedida" : "preferencia"}</small>
                    </div>
                    <div className="calendar-row__what">
                      <input
                        type="text"
                        value={valor}
                        maxLength={200}
                        placeholder={indice === 0 ? "La que más quieres" : "Alternativa"}
                        aria-label={`Denominación ${indice + 1}`}
                        onChange={(event) => {
                          const copia = [...denominaciones];
                          copia[indice] = event.target.value;
                          setDenominaciones(copia);
                        }}
                      />
                      <label className="calendar-row__rule">
                        <input
                          type="radio"
                          name="denominacion-concedida"
                          checked={concedida === indice + 1}
                          onChange={() => setConcedida(indice + 1)}
                        />{" "}
                        El Registro me concedió ésta
                      </label>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="calendar-card__undated">
                <h3>Fecha de la certificación</h3>
                <p className="calendar-card__warn">
                  El día que el Registro expidió la certificación negativa. De ella arrancan dos
                  relojes distintos: tres meses para otorgar la escritura y seis de reserva del
                  nombre. Sin esta fecha no puedo calcular ninguno de los dos.
                </p>
                <input
                  type="date"
                  value={certificadaEl}
                  aria-label="Fecha de expedición de la certificación"
                  onChange={(event) => setCertificadaEl(event.target.value)}
                />
                {plazosRmc && (
                  <ul className="calendar-card__list">
                    <li className="calendar-row">
                      <div className="calendar-row__what">
                        <strong>Otorgar la escritura, hasta el {fechaLarga(plazosRmc.limiteEscritura)}</strong>
                        <p>Tres meses desde la expedición.</p>
                      </div>
                    </li>
                    <li className="calendar-row">
                      <div className="calendar-row__what">
                        <strong>Reserva del nombre, hasta el {fechaLarga(plazosRmc.limiteReserva)}</strong>
                        <p>
                          No basta con firmar dentro de plazo: la certificación tiene que seguir
                          vigente cuando la escritura se <strong>presenta</strong> en el Registro.
                        </p>
                      </div>
                    </li>
                  </ul>
                )}
              </div>

              <button
                type="button"
                className="gold-button gold-button--small"
                onClick={() => void guardarDenominaciones()}
                disabled={guardandoRmc}
              >
                {guardandoRmc ? "Guardando…" : "Guardar denominaciones"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </section>

            {/* Archivar no borra. Existe porque el panel muestra el expediente
                más reciente, y uno de más desplaza al verdadero. */}
            {proyectos && proyectos.length > 1 && (
              <section className="calendar-card" id="expedientes">
                <div className="section-heading">
                  <h2>Tus expedientes</h2>
                  <span>{proyectos.filter((p) => !p.archivado).length} abiertos</span>
                </div>
                <p className="calendar-card__warn">
                  El panel muestra el más reciente de los abiertos. Archivar no borra nada: el
                  expediente conserva sus trámites, sus documentos y su historial, y puedes
                  recuperarlo cuando quieras.
                </p>
                <ol className="calendar-card__list">
                  {proyectos.map((proyecto) => (
                    <li key={proyecto.id} className="calendar-row">
                      <div className="calendar-row__what">
                        <strong>{proyecto.name}</strong>
                        <span className="calendar-row__period">
                          {proyecto.archivado ? "Archivado" : "Abierto"}
                        </span>
                        <button
                          type="button"
                          className="gold-button gold-button--small"
                          onClick={() => void archivarProyecto(proyecto.id, !proyecto.archivado)}
                          disabled={archivando === proyecto.id}
                        >
                          {archivando === proyecto.id
                            ? "Cambiando…"
                            : proyecto.archivado
                              ? "Recuperar"
                              : "Archivar"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="itinerary-card" id="itinerario">
              <div className="section-heading">
                <h2>Itinerario hasta tener la empresa</h2>
                <span>
                  {itinerary
                    ? `${itinerary.tasks.filter((t) => t.status === "COMPLETED").length}/${itinerary.tasks.length} hechos`
                    : "sin abrir"}
                </span>
              </div>

              {!itinerary && (
                <div className="itinerary-card__intro">
                  <p>
                    Todos los trámites que separan tu idea de una empresa
                    existente, en el orden en que se pueden hacer y con lo que
                    hace falta para dar cada uno por hecho.
                  </p>
                  <ul>
                    <li><strong>Cómo</strong> — cada papel que subes al archivo mueve solo el trámite al que responde: la escritura mueve la escritura, el justificante del 036 mueve el alta censal.</li>
                    <li><strong>Qué te devuelve</strong> — en qué punto estás, qué puedes hacer ya y qué está esperando a que responda un tercero.</li>
                    <li><strong>Qué resuelve</strong> — saber si la empresa está creada de verdad, y poder demostrar con qué documento se cerró cada paso.</li>
                  </ul>
                  <p className="itinerary-card__warn">
                    Un documento no da un trámite por hecho por su cuenta. La
                    categoría la eliges tú, y un PDF mal clasificado cerraría un
                    paso ante notaría sin que nadie lo mire. Lo cierras tú, y
                    queda guardado con qué documento.
                  </p>
                </div>
              )}

              {itinerary && itinerary.tasks.length === 0 && (
                <p className="itinerary-card__warn">{itinerary.message ?? "Todavía no hay itinerario."}</p>
              )}

              {itinerary && itinerary.tasks.length > 0 && (
                <ol className="itinerary-card__list">
                  {itinerary.tasks.map((task) => (
                    <li key={task.code} className={`itinerary-row itinerary-row--${task.status.toLowerCase()}`}>
                      <div className="itinerary-row__head">
                        <strong>{task.title}</strong>
                        <span>{TASK_STATUS_LABEL[task.status] ?? task.status}</span>
                      </div>
                      <p className="itinerary-row__detail">{task.detail}</p>
                      <p className="itinerary-row__how">Se acredita con: {task.verificationMethod}</p>

                      {task.pendingVerification && (
                        <p className="itinerary-row__pending">{task.pendingVerification}</p>
                      )}

                      {task.documents.length > 0 && (
                        <ul className="itinerary-row__files">
                          {task.documents.map((documento) => (
                            <li key={documento.id}>
                              <a
                                  href={`/api/expediente/documentos/${documento.id}`}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                {documento.displayName} <span aria-hidden="true">↓</span>
                              </a>
                              <small>{documento.categoryLabel}</small>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="itinerary-row__meta">
                        <span>{task.authority}</span>
                        {task.sourceUrl && (
                          <a href={task.sourceUrl} target="_blank" rel="noreferrer">
                            fuente <span aria-hidden="true">↗</span>
                          </a>
                        )}
                      </div>

                      <button
                        type="button"
                        className="text-button text-button--tiny"
                        onClick={() => void abrirCarpeta(task)}
                        disabled={carpetaCargando !== null}
                        aria-expanded={carpeta?.code === task.code}
                      >
                        {carpetaCargando === task.code
                          ? "Preparando…"
                          : carpeta?.code === task.code
                            ? "Cerrar la carpeta"
                            : "Preparar la carpeta de este trámite"}
                      </button>

                      {carpeta?.code === task.code && (
                        <div className="carpeta">
                          <p className="carpeta__paso">{carpeta.siguientePaso}</p>

                          {carpeta.bloqueadoPor.length > 0 && (
                            <div className="carpeta__bloque">
                              <h4>Antes hay que cerrar</h4>
                              <ul>
                                {carpeta.bloqueadoPor.map((bloqueo) => (
                                  <li key={bloqueo.code}>{bloqueo.title}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {carpeta.datos.length > 0 && (
                            <div className="carpeta__bloque">
                              <h4>Datos que vas a necesitar a mano</h4>
                              <dl className="carpeta__datos">
                                {carpeta.datos.map((dato) => (
                                  <div key={dato.campo}>
                                    <dt>{dato.etiqueta}</dt>
                                    <dd>{dato.valor}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          )}

                          {carpeta.faltan.length > 0 && (
                            <div className="carpeta__bloque">
                              <h4>Faltan en el expediente</h4>
                              <ul className="carpeta__faltan">
                                {carpeta.faltan.map((hueco) => (
                                  <li key={hueco.campo}>
                                    <strong>{hueco.etiqueta}</strong> — {hueco.comoSeConsigue}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {carpeta.papelesAportados.length > 0 && (
                            <div className="carpeta__bloque">
                              <h4>Papeles ya aportados</h4>
                              <ul>
                                {carpeta.papelesAportados.map((papel) => (
                                  <li key={papel.category}>
                                    {papel.etiqueta}
                                    {papel.nombre ? ` — ${papel.nombre}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {carpeta.papelesQueFaltan.length > 0 && (
                            <div className="carpeta__bloque">
                              <h4>Papeles que faltan por subir</h4>
                              <ul className="carpeta__faltan">
                                {carpeta.papelesQueFaltan.map((papel) => (
                                  <li key={papel.category}>{papel.etiqueta}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {carpeta.advertencias.map((aviso) => (
                            <p className="carpeta__aviso" key={aviso}>
                              {aviso}
                            </p>
                          ))}

                          <a
                            className="text-button text-button--tiny"
                            href={`/api/expediente/tramites/${encodeURIComponent(task.code)}/dossier?formato=html`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir para imprimir o guardar en PDF <span aria-hidden="true">↗</span>
                          </a>
                        </div>
                      )}

                      {task.status !== "COMPLETED" && task.confirmable && (
                        <button
                          type="button"
                          className="text-button text-button--tiny"
                          onClick={() => void confirmTask(task)}
                          disabled={itinerary.canConfirm === false || confirmingTask !== null}
                        >
                          {confirmingTask === task.code ? "Cerrando…" : "Este documento lo acredita · dar por hecho"}
                        </button>
                      )}
                      {task.status !== "COMPLETED" && !task.confirmable && (
                        <p className="itinerary-row__need">
                          Sin documento aportado no puedo darlo por hecho. Súbelo en el archivo.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              <button
                type="button"
                className="gold-button gold-button--small"
                onClick={() => void loadItinerary()}
                disabled={loadingItinerary}
              >
                {loadingItinerary ? "Abriendo…" : itinerary ? "Actualizar el itinerario" : "Ver mi itinerario"}{" "}
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
