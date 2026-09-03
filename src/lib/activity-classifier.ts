import { officialSourceCatalog } from "@/lib/official-sources";

/**
 * Clasificador de actividad.
 *
 * Módulo puro y determinista: las mismas palabras producen siempre la misma
 * clasificación, sin modelo de lenguaje de por medio. Eso importa porque de
 * aquí sale la ruta administrativa de una empresa real.
 *
 * La regla que gobierna todo el fichero: NO se inventa ni un epígrafe de IAE ni
 * un código CNAE. Nunca. El clasificador reconoce el sector y las señales del
 * negocio, y a partir de ahí dice QUÉ hay que comprobar y EN QUÉ SEDE, dejando
 * la respuesta concreta para la consulta oficial. Una obligación sin fuente no
 * se emite.
 */

export type ActivitySector =
  | "SOFTWARE_Y_SERVICIOS_DIGITALES"
  | "SERVICIOS_PROFESIONALES"
  | "COMERCIO_MINORISTA"
  | "HOSTELERIA_Y_RESTAURACION"
  | "SALUD_Y_BIENESTAR"
  | "EDUCACION_Y_FORMACION"
  | "CONSTRUCCION_Y_REFORMAS"
  | "TRANSPORTE_Y_LOGISTICA"
  | "TURISMO_Y_ALOJAMIENTO"
  | "INDUSTRIA_Y_FABRICACION"
  | "INMOBILIARIO"
  | "SIN_DETERMINAR";

export type RegulatoryExposure = "REQUIERE_COMPROBACION" | "SIN_INDICIOS";

export type ObligationToVerify = {
  topic: string;
  why: string;
  authority: string;
  sourceUrl: string;
  status: "PENDING_VERIFICATION";
};

export type ActivityClassification = {
  sector: ActivitySector;
  sectorLabel: string;
  confidence: number;
  evidence: string[];
  signals: Record<string, boolean>;
  regulatoryExposure: RegulatoryExposure;
  regulatoryReason: string;
  iaeCode: null;
  cnaeCode: null;
  codesNote: string;
  obligationsToVerify: ObligationToVerify[];
  nextQuestions: string[];
  informationalOnly: true;
};

export type ActivityInput = {
  description?: string | null;
  municipality?: string | null;
  hasPremises?: boolean | null;
  onlineActivity?: boolean | null;
  willHireWorkers?: boolean | null;
  euOperations?: boolean | null;
  nonEuOperations?: boolean | null;
  ecommerce?: boolean | null;
  founderWorksInBusiness?: boolean | null;
};

const SECTOR_LABELS: Record<ActivitySector, string> = {
  SOFTWARE_Y_SERVICIOS_DIGITALES: "Software y servicios digitales",
  SERVICIOS_PROFESIONALES: "Servicios profesionales",
  COMERCIO_MINORISTA: "Comercio minorista",
  HOSTELERIA_Y_RESTAURACION: "Hostelería y restauración",
  SALUD_Y_BIENESTAR: "Salud y bienestar",
  EDUCACION_Y_FORMACION: "Educación y formación",
  CONSTRUCCION_Y_REFORMAS: "Construcción y reformas",
  TRANSPORTE_Y_LOGISTICA: "Transporte y logística",
  TURISMO_Y_ALOJAMIENTO: "Turismo y alojamiento",
  INDUSTRIA_Y_FABRICACION: "Industria y fabricación",
  INMOBILIARIO: "Inmobiliario",
  SIN_DETERMINAR: "Sin determinar",
};

/** Términos en castellano tal y como los escribe una persona, no jerga fiscal. */
const SECTOR_TERMS: Array<{ sector: ActivitySector; terms: string[] }> = [
  {
    sector: "SOFTWARE_Y_SERVICIOS_DIGITALES",
    terms: [
      "software", "aplicacion", "aplicaciones", "app", "saas", "programacion",
      "desarrollo web", "pagina web", "inteligencia artificial", "datos",
      "ciberseguridad", "informatica", "plataforma digital", "videojuego",
    ],
  },
  {
    sector: "SERVICIOS_PROFESIONALES",
    terms: [
      "consultoria", "asesoria", "abogado", "abogacia", "arquitecto", "ingenieria",
      "marketing", "publicidad", "diseno grafico", "traduccion", "contabilidad",
      "recursos humanos", "agencia",
    ],
  },
  {
    sector: "COMERCIO_MINORISTA",
    terms: [
      "tienda", "comercio", "venta al publico", "boutique", "papeleria",
      "ferreteria", "libreria", "ropa", "zapateria", "tienda online",
    ],
  },
  {
    sector: "HOSTELERIA_Y_RESTAURACION",
    terms: [
      "bar", "restaurante", "cafeteria", "cocina", "catering", "comida",
      "bebidas", "food truck", "panaderia", "pasteleria", "heladeria",
    ],
  },
  {
    sector: "SALUD_Y_BIENESTAR",
    terms: [
      "clinica", "fisioterapia", "psicologia", "nutricion", "dentista",
      "podologia", "enfermeria", "estetica", "peluqueria", "gimnasio",
      "entrenador personal", "masaje",
    ],
  },
  {
    sector: "EDUCACION_Y_FORMACION",
    terms: [
      "academia", "formacion", "clases", "escuela", "curso", "cursos",
      "guarderia", "ludoteca", "profesor", "tutoria",
    ],
  },
  {
    sector: "CONSTRUCCION_Y_REFORMAS",
    terms: [
      "reformas", "construccion", "obra", "albanileria", "fontaneria",
      "electricidad", "pintura", "carpinteria", "climatizacion",
    ],
  },
  {
    sector: "TRANSPORTE_Y_LOGISTICA",
    terms: [
      "transporte", "mensajeria", "paqueteria", "reparto", "logistica",
      "mudanzas", "taxi", "vtc", "flota",
    ],
  },
  {
    sector: "TURISMO_Y_ALOJAMIENTO",
    terms: [
      "turismo", "alojamiento", "apartamento turistico", "hotel", "hostal",
      "casa rural", "excursiones", "guia turistico", "agencia de viajes",
    ],
  },
  {
    sector: "INDUSTRIA_Y_FABRICACION",
    terms: [
      "fabricacion", "fabrica", "taller", "produccion", "manufactura",
      "montaje", "envasado", "maquinaria",
    ],
  },
  {
    sector: "INMOBILIARIO",
    terms: [
      "inmobiliaria", "alquiler de viviendas", "compraventa de inmuebles",
      "gestion de alquileres", "promocion inmobiliaria",
    ],
  },
];

/** Sectores donde dar por hecho que no hay regulación sería temerario. */
const SECTORS_WITH_LIKELY_REGIME: ActivitySector[] = [
  "HOSTELERIA_Y_RESTAURACION",
  "SALUD_Y_BIENESTAR",
  "TURISMO_Y_ALOJAMIENTO",
  "TRANSPORTE_Y_LOGISTICA",
  "EDUCACION_Y_FORMACION",
  "CONSTRUCCION_Y_REFORMAS",
  "INDUSTRIA_Y_FABRICACION",
];

/** Quita acentos y baja a minúsculas sin depender del locale del servidor. */
export function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceFor(predicate: (title: string, authority: string) => boolean) {
  const found = officialSourceCatalog.find((source) =>
    predicate(normalizeText(source.title), normalizeText(source.authority)),
  );
  // El catálogo es la única procedencia admitida de una URL. Si no hay entrada,
  // no se emite la obligación: antes callar que inventar una dirección.
  return found ?? null;
}

function obligation(
  topic: string,
  why: string,
  predicate: (title: string, authority: string) => boolean,
): ObligationToVerify | null {
  const source = sourceFor(predicate);
  if (!source) return null;
  return {
    topic,
    why,
    authority: source.authority,
    sourceUrl: source.url,
    status: "PENDING_VERIFICATION",
  };
}

export function classifyActivity(input: ActivityInput): ActivityClassification {
  const text = normalizeText(input.description);

  const scores = SECTOR_TERMS.map(({ sector, terms }) => {
    const hits = terms.filter((term) => text.includes(term));
    return { sector, hits };
  }).sort((a, b) => b.hits.length - a.hits.length);

  const best = scores[0];
  const runnerUp = scores[1];
  const decided = Boolean(best && best.hits.length > 0);
  const ambiguous = Boolean(
    decided && runnerUp && runnerUp.hits.length === best!.hits.length,
  );

  const sector: ActivitySector = decided && !ambiguous ? best!.sector : "SIN_DETERMINAR";
  const evidence = decided ? best!.hits : [];
  // La confianza sube con las coincidencias, pero no llega nunca a 1: esto
  // orienta, no decide.
  const confidence = sector === "SIN_DETERMINAR" ? 0 : Math.min(0.85, 0.45 + evidence.length * 0.15);

  const signals: Record<string, boolean> = {
    localFisico: input.hasPremises === true,
    actividadOnline: input.onlineActivity === true || input.ecommerce === true,
    comercioElectronico: input.ecommerce === true,
    contratara: input.willHireWorkers === true,
    operacionesUE: input.euOperations === true,
    operacionesFueraUE: input.nonEuOperations === true,
    fundadorTrabajaEnLaEmpresa: input.founderWorksInBusiness !== false,
  };

  const exposureLikely = SECTORS_WITH_LIKELY_REGIME.includes(sector) || signals.localFisico;
  const regulatoryExposure: RegulatoryExposure = exposureLikely
    ? "REQUIERE_COMPROBACION"
    : "SIN_INDICIOS";
  const regulatoryReason = exposureLikely
    ? sector === "SIN_DETERMINAR"
      ? "Vas a tener local físico, y eso abre licencias municipales que dependen del ayuntamiento."
      : `${SECTOR_LABELS[sector]} suele tener régimen propio o licencias. Hay que comprobarlo antes de darlo por bueno.`
    : "No he encontrado indicios de actividad regulada en lo que me has contado. Eso no es lo mismo que confirmar que no la hay.";

  const candidatas: Array<ObligationToVerify | null> = [
    obligation(
      "Epígrafe del IAE",
      "El epígrafe determina la matrícula del impuesto y condiciona el alta censal. No lo deduzco: se consulta.",
      (title) => title.includes("actividades economicas"),
    ),
    obligation(
      "Declaración censal (modelo 036)",
      "Es el trámite que comunica el inicio de actividad y las obligaciones asociadas.",
      (title) => title.includes("asistente virtual censal"),
    ),
  ];

  if (signals.fundadorTrabajaEnLaEmpresa) {
    candidatas.push(
      obligation(
        "Alta en el régimen de la Seguridad Social que corresponda",
        "Quien trabaje en la empresa tiene que estar encuadrado. El régimen exacto depende del caso.",
        (_title, authority) => authority.includes("seguridad social"),
      ),
    );
  }

  if (signals.contratara) {
    candidatas.push(
      obligation(
        "Inscripción de la empresa y código de cuenta de cotización",
        "Sin inscripción y sin CCC no se puede dar de alta a nadie.",
        (_title, authority) => authority.includes("seguridad social"),
      ),
    );
  }

  if (signals.operacionesUE || signals.operacionesFueraUE) {
    candidatas.push(
      obligation(
        "Operaciones intracomunitarias y censo VIES",
        "Vender o comprar fuera de España cambia el IVA aplicable y las declaraciones informativas.",
        (title) => title.includes("portal de empresas"),
      ),
    );
  }

  if (signals.localFisico) {
    candidatas.push(
      obligation(
        "Licencia municipal del local",
        "La licencia de apertura o la declaración responsable la resuelve el ayuntamiento, no la AEAT.",
        (title) => title.includes("circe"),
      ),
    );
  }

  if (exposureLikely && sector !== "SIN_DETERMINAR") {
    candidatas.push(
      obligation(
        "Requisitos sectoriales y normativa vigente",
        `Comprobar en el BOE qué normativa aplica hoy a ${SECTOR_LABELS[sector].toLowerCase()}.`,
        (_title, authority) => authority.includes("boe"),
      ),
    );
  }

  const obligationsToVerify = candidatas.filter(
    (item): item is ObligationToVerify => item !== null,
  );

  const nextQuestions: string[] = [];
  if (sector === "SIN_DETERMINAR") {
    nextQuestions.push(
      ambiguous
        ? "Tu descripción encaja en más de un sector. ¿Qué parte del negocio va a facturar más?"
        : "Cuéntame con más detalle qué vas a vender y a quién.",
    );
  }
  if (input.hasPremises === null || input.hasPremises === undefined) {
    nextQuestions.push("¿Vas a tener local físico o trabajarás sin local?");
  }
  if (input.municipality === null || input.municipality === undefined || input.municipality === "") {
    nextQuestions.push("¿En qué municipio y provincia?");
  }
  if (input.willHireWorkers === null || input.willHireWorkers === undefined) {
    nextQuestions.push("¿Vas a contratar a alguien el primer año?");
  }

  return {
    sector,
    sectorLabel: SECTOR_LABELS[sector],
    confidence,
    evidence,
    signals,
    regulatoryExposure,
    regulatoryReason,
    iaeCode: null,
    cnaeCode: null,
    codesNote:
      "NO_VERIFIED_SOURCE: el epígrafe de IAE y el código CNAE no se deducen. Se consultan en la sede oficial y se confirman contigo antes de incorporarlos al expediente.",
    obligationsToVerify,
    nextQuestions: nextQuestions.slice(0, 3),
    informationalOnly: true,
  };
}

export { SECTOR_LABELS };
