/**
 * Dato regulatorio, separado del código y de la interfaz.
 *
 * La normativa cambia; el código no debería. Cada hecho lleva su autoridad, su
 * verbatim, su fecha de verificación y una regla de producto. Un hecho con
 * `requiresLiveVerification` no puede sostener una obligación cerrada: la tarea
 * que dependa de él nace avisando de que falta comprobarlo.
 */

export type StatementAuthority =
  | "OFFICIAL_SOURCE"
  | "LAW"
  | "INFERENCE"
  | "USER_DATA"
  | "MODEL_SUGGESTION"
  | "NO_VERIFIED_SOURCE";

export type RegulatoryFact = {
  key: string;
  statement: string;
  authority: StatementAuthority;
  effectiveDate?: string;
  lastVerifiedAt: string;
  confidence: number;
  requiresLiveVerification: boolean;
  productRule: string;
  sources: Array<{ authority: string; title: string; url: string }>;
  verificationNote?: string;
};

export const REGULATORY_FACTS: RegulatoryFact[] = [
  {
    key: "MODELO_037_SUPRIMIDO",
    statement:
      "El modelo 037 de declaración censal simplificada está suprimido. La operativa censal se concentra en el modelo 036.",
    authority: "LAW",
    effectiveDate: "2025-02-03",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.98,
    requiresLiveVerification: false,
    productRule:
      "Ninguna tarea, documento ni respuesta puede indicar que se presente el modelo 037. Sólo cabe mencionarlo para decir que está suprimido.",
    sources: [
      {
        authority: "BOE",
        title: "Orden HAC/1526/2024, de 11 de diciembre",
        url: "https://www.boe.es/buscar/doc.php?id=BOE-A-2025-410",
      },
      {
        authority: "AEAT",
        title: "Orden Ministerial de modificación de declaraciones censales",
        url: "https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/enero/9/orden-ministerial-modificacion-declaraciones-censales.html",
      },
    ],
  },
  {
    key: "MODELO_036_TITULARIDAD_REAL",
    statement:
      "El modelo 036 incorpora un apartado para comunicar la titularidad real de personas jurídicas y entidades, y una casilla para solicitar la rehabilitación del NIF.",
    authority: "LAW",
    effectiveDate: "2025-02-03",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.97,
    requiresLiveVerification: false,
    productRule:
      "Si el sujeto es persona jurídica, el expediente debe recoger la titularidad real. Es un dato de riesgo alto: exige confirmación explícita.",
    sources: [
      {
        authority: "BOE",
        title: "Orden HAC/1526/2024, de 11 de diciembre",
        url: "https://www.boe.es/buscar/doc.php?id=BOE-A-2025-410",
      },
    ],
  },
  {
    key: "IAE_EXENCIONES",
    statement:
      "Están exentos del IAE las personas físicas, residentes o no; los sujetos pasivos del Impuesto sobre Sociedades, sociedades civiles y entidades del artículo 35.4 de la LGT con importe neto de la cifra de negocios inferior a 1.000.000 €; y quienes inicien actividad en territorio español, durante los dos primeros períodos impositivos del impuesto en que se desarrolle aquella.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "No confundir alta de actividad, obligación censal, obligación de pagar IAE y los modelos 036, 840 y 848.",
    sources: [
      {
        authority: "AEAT",
        title: "Folleto de actividades económicas — Impuesto sobre Actividades Económicas",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/folleto-actividades-economicas/2-impuesto-sobre-actividades-economicas.html",
      },
    ],
  },
  {
    key: "IAE_MODELOS",
    statement:
      "Quien no está exento del IAE comunica altas, bajas y variaciones con el modelo 840. Quien está exento lo hace con el modelo 036. Las personas jurídicas y entidades con importe neto de la cifra de negocios igual o superior a 1.000.000 € presentan además el modelo 848 entre el 1 de enero y el 14 de febrero, salvo que ese importe ya conste en la declaración del Impuesto sobre Sociedades o del IRNR.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.93,
    requiresLiveVerification: false,
    productRule: "El itinerario deriva la tarea censal de esta matriz, nunca del criterio libre de un modelo.",
    sources: [
      {
        authority: "AEAT",
        title: "IAE — ¿Qué modelo de declaración tengo que presentar?",
        url: "https://sede.agenciatributaria.gob.es/Sede/declaraciones-informativas-otros-impuestos-tasas/impuesto-sobre-actividades-economicas/que-modelo-declaracion-tengo-que-presentar.html",
      },
    ],
  },
  {
    key: "SL_CAPITAL_MINIMO",
    statement:
      "El capital mínimo de la sociedad de responsabilidad limitada es de un euro. Mientras el capital no alcance 3.000 € debe destinarse a la reserva legal al menos el 20 % del beneficio hasta que la suma de reserva y capital llegue a esa cifra, y en caso de liquidación con patrimonio insuficiente los socios responden solidariamente de la diferencia hasta 3.000 €.",
    authority: "LAW",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "Nunca presentar 1 € como recomendación por defecto. Exponer las tres consecuencias y dejar decidir a la persona.",
    sources: [
      {
        authority: "BOE",
        title: "Ley de Sociedades de Capital, texto consolidado",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544",
      },
    ],
  },
  {
    key: "TGSS_INSCRIPCION_EMPRESA",
    statement:
      "Quien vaya a contratar trabajadores por primera vez debe inscribirse como empresario en la Seguridad Social antes del inicio de la actividad y obtener un Código de Cuenta de Cotización.",
    authority: "NO_VERIFIED_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.4,
    requiresLiveVerification: true,
    verificationNote:
      "Pendiente de verificar contra Importass: el portal de la Seguridad Social exige JavaScript y el extractor no obtuvo contenido.",
    productRule:
      "La tarea de inscripción no nace lista para ejecutarse: avisa de que el fundamento está sin verificar.",
    sources: [
      {
        authority: "TGSS",
        title: "Importass — Portal de trámites de la Seguridad Social",
        url: "https://portal.seg-social.gob.es/wps/portal/importass/importass",
      },
    ],
  },
  {
    key: "CIRCE_DUE",
    statement:
      "CIRCE permite tramitar telemáticamente la constitución y puesta en marcha de determinadas formas empresariales mediante el Documento Único Electrónico, a través de los Puntos de Atención al Emprendimiento.",
    authority: "NO_VERIFIED_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.45,
    requiresLiveVerification: true,
    verificationNote:
      "Pendiente de confirmar qué formas jurídicas admite hoy: la página del Punto de Acceso General está bloqueada por robots.txt.",
    productRule:
      "Ofrecer CIRCE como ruta preferente sólo tras verificar que la forma jurídica concreta es tramitable. Nunca automatizar la presentación: se enlaza al PAE.",
    sources: [
      {
        authority: "CIRCE / PAE",
        title: "PAE electrónico",
        url: "https://www.paeelectronico.es/",
      },
    ],
  },
];

export function fact(key: string): RegulatoryFact | undefined {
  return REGULATORY_FACTS.find((item) => item.key === key);
}

/** Un hecho sólo sostiene una obligación si está verificado y viene de fuente oficial o de la ley. */
export function isBindingFact(item: RegulatoryFact | undefined): boolean {
  return Boolean(
    item &&
      !item.requiresLiveVerification &&
      (item.authority === "OFFICIAL_SOURCE" || item.authority === "LAW"),
  );
}

export const INFORMATIONAL_FOOTER =
  "Información orientativa basada en fuentes oficiales consultadas. No constituye una consulta tributaria vinculante. Para una respuesta tributaria escrita vinculante corresponde acudir a los mecanismos oficiales competentes.";
