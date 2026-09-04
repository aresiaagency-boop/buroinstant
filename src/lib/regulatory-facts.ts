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
  {
    key: "PLAZO_RETENCIONES_TRIMESTRAL",
    statement:
      "Las retenciones e ingresos a cuenta de cada trimestre (modelos 111, 115, 117, 123, 124, 126, 128, 136, 210 y 216) se presentan hasta el día 20 del mes siguiente al fin del trimestre. Las del cuarto trimestre, hasta el 20 de enero.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "El calendario puede fijar la fecha de los modelos 111 y 115. Si cae en sábado, domingo o festivo, se traslada al siguiente día hábil y el aviso debe decir que los festivos autonómicos y locales no están aplicados.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de enero",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/enero/hasta-20-enero.html",
      },
    ],
  },
  {
    key: "PLAZO_IVA_TRIMESTRAL",
    statement:
      "La autoliquidación trimestral de IVA (modelo 303) se presenta hasta el día 20 del mes siguiente al fin del trimestre. La del cuarto trimestre, hasta el 30 de enero, junto con el resumen anual (modelo 390).",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "El calendario puede fijar la fecha del modelo 303 y del 390. El cuarto trimestre no vence el día 20: vence el 30 de enero.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 30 de enero",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/enero/hasta-30-enero.html",
      },
    ],
  },
  {
    key: "PLAZO_PAGO_FRACCIONADO_IRPF",
    statement:
      "El pago fraccionado de IRPF en estimación directa (modelo 130) se presenta hasta el día 20 del mes siguiente al fin del trimestre; el del cuarto trimestre, hasta el 30 de enero.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.94,
    requiresLiveVerification: false,
    productRule:
      "Sólo aplica a persona física en estimación directa. Una sociedad no presenta el modelo 130.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 30 de enero",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/enero/hasta-30-enero.html",
      },
    ],
  },
  {
    key: "PLAZO_PAGO_FRACCIONADO_SOCIEDADES",
    statement:
      "El pago fraccionado del Impuesto sobre Sociedades en régimen general (modelo 202) se presenta en abril, octubre y diciembre, hasta el día 20 de cada uno de esos meses.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.9,
    requiresLiveVerification: false,
    productRule:
      "Sólo aplica a entidades sujetas al Impuesto sobre Sociedades. La obligación de presentarlo depende de la cifra de negocios y del resultado del ejercicio anterior: el aviso debe decirlo.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
    ],
  },
  {
    key: "PLAZO_IMPUESTO_SOCIEDADES",
    statement:
      "La declaración anual del Impuesto sobre Sociedades (modelos 200 y 220) se presenta en los 25 días naturales siguientes a los seis meses posteriores al fin del período impositivo. Para entidades cuyo período impositivo coincide con el año natural, el plazo termina el 25 de julio; en el calendario de 2026 figura hasta el 27 de julio por traslado a día hábil.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "Sólo aplica a entidades sujetas al Impuesto sobre Sociedades. Si el ejercicio no coincide con el año natural, la fecha se calcula desde el cierre y debe decirse expresamente.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 27 de julio",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/julio/hasta-27-julio.html",
      },
    ],
  },
  {
    key: "PLAZO_CUOTA_RETA",
    statement:
      "El ingreso de las cuotas del Régimen Especial de Trabajadores Autónomos correspondientes a cada mes se realiza dentro de ese mismo mes.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "Aplica a quien esté de alta en RETA: autónomo y también socio administrador cuando corresponda. Con domiciliación el cargo lo practica la Tesorería; el aviso no puede afirmar que el pago ya está hecho.",
    sources: [
      {
        authority: "Seguridad Social",
        title: "Cotización y recaudación de trabajadores · plazo de ingreso",
        url: "https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/CotizacionRecaudacionTrabajadores/10721/10724/1320/1323",
      },
    ],
  },
  {
    key: "PLAZO_RESUMEN_ANUAL_RETENCIONES",
    statement:
      "Los resúmenes anuales de retenciones (modelos 190 y 180) se presentan en enero, pero la fecha exacta del ejercicio en curso debe leerse en el calendario del contribuyente vigente.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.6,
    requiresLiveVerification: true,
    verificationNote:
      "El calendario del contribuyente consultado no confirma el día exacto de los modelos 190 y 180. Hay que comprobarlo en el calendario del ejercicio antes de fijar la fecha.",
    productRule:
      "La obligación se muestra sin fecha cerrada y con el enlace al calendario oficial. Nunca se presenta como una fecha confirmada.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente",
        url: "https://sede.agenciatributaria.gob.es/Sede/calendario-contribuyente.html",
      },
    ],
  },
  {
    key: "PLAZO_CUENTAS_ANUALES",
    statement:
      "Las cuentas anuales se depositan en el Registro Mercantil dentro del mes siguiente a su aprobación por la junta general, conforme al Reglamento del Registro Mercantil.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.6,
    requiresLiveVerification: true,
    verificationNote:
      "La fecha depende del día en que la junta apruebe las cuentas, que es un dato del expediente. Sin esa fecha no puede fijarse el vencimiento del depósito.",
    productRule:
      "Se muestra como obligación anual sin fecha cerrada hasta que el expediente registre la fecha de aprobación de la junta.",
    sources: [
      {
        authority: "BOE",
        title: "Real Decreto 1784/1996, Reglamento del Registro Mercantil",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-1996-17533",
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
