import { fact, isBindingFact } from "@/lib/regulatory-facts";

/**
 * Motor de trámites.
 *
 * Convierte el perfil de un proyecto en la ruta burocrática real: cada
 * obligación con su autoridad competente, sus dependencias, los documentos que
 * exige y cómo se acredita que está hecha.
 *
 * Dos reglas gobiernan el resultado:
 *   1. Ninguna tarea puede indicar que se presente el modelo 037.
 *   2. Una tarea cuyo fundamento normativo no esté verificado no nace READY:
 *      nace NOT_STARTED y dice qué falta comprobar.
 */

export const TASK_STATUSES = [
  "NOT_STARTED",
  "WAITING_USER",
  "READY",
  "IN_PROGRESS",
  "WAITING_AUTHORITY",
  "COMPLETED",
  "BLOCKED",
  "NOT_APPLICABLE",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type LegalForm = "AUTONOMO" | "SL" | "SLU" | "SA" | null;

export type RevenueBand = "UNKNOWN" | "UNDER_60K" | "K60_250" | "K250_1M" | "OVER_1M";

export type ProjectProfile = {
  legalForm: LegalForm;
  founders: number;
  hasPremises: boolean;
  publicConcurrence: boolean;
  willHireWorkers: boolean;
  euOperations: boolean;
  nonEuOperations: boolean;
  ecommerce: boolean;
  regulatedActivity: boolean;
  revenueBand: RevenueBand;
};

export type DerivedTask = {
  code: string;
  title: string;
  detail: string;
  authority: string;
  status: TaskStatus;
  priority: number;
  dependencyCodes: string[];
  requiredDocuments: string[];
  verificationMethod: string;
  sourceUrl?: string;
  pendingVerification?: string;
};

export const DEFAULT_PROFILE: ProjectProfile = {
  legalForm: null,
  founders: 1,
  hasPremises: false,
  publicConcurrence: false,
  willHireWorkers: false,
  euOperations: false,
  nonEuOperations: false,
  ecommerce: false,
  regulatedActivity: false,
  revenueBand: "UNKNOWN",
};

function sourceFor(key: string) {
  return fact(key)?.sources[0]?.url;
}

/** Ajusta el estado inicial al nivel de verificación del hecho que sostiene la tarea. */
function statusFor(factKey: string, wanted: TaskStatus): Pick<DerivedTask, "status" | "pendingVerification"> {
  const item = fact(factKey);
  if (!item || isBindingFact(item)) return { status: wanted };
  return {
    status: "NOT_STARTED",
    pendingVerification: item.verificationNote ?? "Pendiente de verificar contra la fuente oficial vigente.",
  };
}

export function deriveTasks(input: Partial<ProjectProfile>): DerivedTask[] {
  const profile: ProjectProfile = { ...DEFAULT_PROFILE, ...input };
  const isCompany = profile.legalForm !== null && profile.legalForm !== "AUTONOMO";
  const tasks: DerivedTask[] = [];

  tasks.push({
    code: "IDENTITY",
    title: "Identidad y documentación de quienes fundan",
    detail: "Reunir y validar la documentación identificativa de las personas que constituyen el proyecto.",
    authority: "BUROINSTANT",
    status: "WAITING_USER",
    priority: 10,
    dependencyCodes: [],
    requiredDocuments: ["IDENTITY"],
    verificationMethod: "Documento legible cargado y verificado por una persona.",
  });

  tasks.push({
    code: "ACTIVITY_CLASSIFICATION",
    title: "Clasificación de la actividad (IAE y CNAE)",
    detail:
      "Proponer epígrafes candidatos a partir de la descripción del negocio y confirmarlos contra la fuente oficial. No se fija ningún epígrafe sin respaldo.",
    authority: "AEAT",
    status: "READY",
    priority: 20,
    dependencyCodes: [],
    requiredDocuments: [],
    verificationMethod: "Epígrafe elegido por la persona sobre candidatos con fuente oficial citada.",
    sourceUrl: sourceFor("IAE_EXENCIONES"),
  });

  if (isCompany) {
    tasks.push(
      {
        code: "COMPANY_NAME",
        title: "Certificación negativa de denominación social",
        detail:
          "Proponer hasta cinco denominaciones y solicitar la certificación negativa en el Registro Mercantil Central. Una denominación no se da por disponible sin esa certificación.",
        authority: "Registro Mercantil Central",
        status: "READY",
        priority: 30,
        dependencyCodes: [],
        requiredDocuments: ["COMPANY_NAME"],
        verificationMethod: "Certificación negativa emitida por el Registro Mercantil Central.",
      },
      {
        code: "BYLAWS",
        title: "Estatutos y objeto social",
        detail:
          "Redactar un borrador de objeto social a partir de las actividades declaradas. El borrador se etiqueta para revisión y no garantiza la inscripción registral.",
        authority: "Notaría / Registro Mercantil",
        status: "WAITING_USER",
        priority: 40,
        dependencyCodes: ["ACTIVITY_CLASSIFICATION"],
        requiredDocuments: ["BYLAWS"],
        verificationMethod: "Estatutos revisados por profesional antes de la firma.",
      },
      {
        code: "CAPITAL",
        title: "Capital social y justificante de aportación",
        detail:
          "Decidir la cifra de capital conociendo sus consecuencias: el mínimo legal es 1 €, pero por debajo de 3.000 € se aplica reserva legal del 20 % del beneficio y responsabilidad solidaria de los socios por la diferencia en caso de liquidación con patrimonio insuficiente.",
        authority: "Notaría / entidad bancaria",
        status: "WAITING_USER",
        priority: 50,
        dependencyCodes: [],
        requiredDocuments: ["BANK"],
        verificationMethod: "Justificante de aportación o declaración conforme a la normativa aplicable.",
        sourceUrl: sourceFor("SL_CAPITAL_MINIMO"),
      },
      {
        code: "BENEFICIAL_OWNERS",
        title: "Titularidad real",
        detail:
          "Identificar y confirmar la titularidad real de la entidad. Desde el 3 de febrero de 2025 el modelo 036 incorpora un apartado específico para comunicarla.",
        authority: "AEAT",
        status: "WAITING_USER",
        priority: 55,
        dependencyCodes: [],
        requiredDocuments: [],
        verificationMethod: "Titularidad real confirmada explícitamente por la persona titular.",
        sourceUrl: sourceFor("MODELO_036_TITULARIDAD_REAL"),
      },
      {
        code: "NOTARY",
        title: "Escritura pública de constitución",
        detail: "Coordinar la cita notarial, revisar el borrador y conservar copia autorizada.",
        authority: "Notaría",
        status: "NOT_STARTED",
        priority: 60,
        dependencyCodes: ["COMPANY_NAME", "BYLAWS", "CAPITAL"],
        requiredDocuments: ["NOTARY"],
        verificationMethod: "Copia autorizada de la escritura de constitución.",
      },
      {
        code: "NIF_PROVISIONAL",
        title: "NIF provisional de la sociedad",
        detail: "Solicitar el NIF provisional para poder operar antes de la inscripción registral.",
        authority: "AEAT",
        status: "NOT_STARTED",
        priority: 65,
        dependencyCodes: ["NOTARY"],
        requiredDocuments: ["TAX"],
        verificationMethod: "Comunicación de NIF provisional.",
      },
      {
        code: "REGISTRY",
        title: "Inscripción en el Registro Mercantil",
        detail: "Presentar la escritura y seguir su calificación hasta la inscripción.",
        authority: "Registro Mercantil",
        status: "NOT_STARTED",
        priority: 70,
        dependencyCodes: ["NOTARY"],
        requiredDocuments: ["REGISTRY"],
        verificationMethod: "Nota de inscripción del Registro Mercantil.",
      },
      {
        code: "NIF_DEFINITIVO",
        title: "NIF definitivo",
        detail: "Solicitar el NIF definitivo una vez inscrita la sociedad.",
        authority: "AEAT",
        status: "NOT_STARTED",
        priority: 75,
        dependencyCodes: ["REGISTRY"],
        requiredDocuments: ["TAX"],
        verificationMethod: "Tarjeta de NIF definitivo.",
      },
    );
  }

  // Alta censal: siempre modelo 036. El 037 está suprimido desde 2025-02-03.
  const censal = statusFor("MODELO_037_SUPRIMIDO", isCompany ? "NOT_STARTED" : "READY");
  tasks.push({
    code: "CENSAL_036",
    title: "Declaración censal de alta — modelo 036",
    detail:
      "Alta en el Censo de empresarios, profesionales y retenedores mediante el modelo 036. El modelo 037 quedó suprimido con efectos de 3 de febrero de 2025.",
    authority: "AEAT",
    priority: 80,
    dependencyCodes: isCompany ? ["NIF_PROVISIONAL", "ACTIVITY_CLASSIFICATION"] : ["ACTIVITY_CLASSIFICATION"],
    requiredDocuments: ["TAX"],
    verificationMethod: "Justificante de presentación del modelo 036.",
    sourceUrl: sourceFor("MODELO_037_SUPRIMIDO"),
    ...censal,
  });

  // Matriz del IAE: la exención depende del importe neto de la cifra de negocios.
  if (isCompany && profile.revenueBand === "OVER_1M") {
    tasks.push({
      code: "IAE_840_848",
      title: "IAE: alta con modelo 840 y comunicación del importe neto con modelo 848",
      detail:
        "Al superar 1.000.000 € de importe neto de la cifra de negocios se pierde la exención: el alta se comunica con el modelo 840 y el importe neto con el modelo 848, entre el 1 de enero y el 14 de febrero, salvo que ya conste en la declaración del Impuesto sobre Sociedades o del IRNR.",
      authority: "AEAT",
      status: "NOT_STARTED",
      priority: 85,
      dependencyCodes: ["CENSAL_036"],
      requiredDocuments: ["TAX"],
      verificationMethod: "Justificantes de presentación de los modelos aplicables.",
      sourceUrl: sourceFor("IAE_MODELOS"),
    });
  } else {
    tasks.push({
      code: "IAE_EXENCION",
      title: "IAE: confirmar la exención y comunicar por modelo 036",
      detail:
        "Las personas físicas y las entidades con importe neto de la cifra de negocios inferior a 1.000.000 €, así como los dos primeros períodos impositivos de inicio de actividad, están exentos. Quien está exento por todas sus actividades comunica altas, modificaciones y bajas con el modelo 036, sin declaración propia del IAE.",
      authority: "AEAT",
      status: "READY",
      priority: 85,
      dependencyCodes: ["ACTIVITY_CLASSIFICATION"],
      requiredDocuments: [],
      verificationMethod: "Exención confirmada con la cifra de negocios real.",
      sourceUrl: sourceFor("IAE_EXENCIONES"),
    });
  }

  if (profile.euOperations) {
    tasks.push({
      code: "ROI_VIES",
      title: "Alta en el Registro de Operadores Intracomunitarios",
      detail:
        "Solicitar el NIF-IVA mediante el modelo 036 y comprobar el alta en VIES antes de facturar sin IVA a clientes de la Unión Europea.",
      authority: "AEAT",
      status: "NOT_STARTED",
      priority: 90,
      dependencyCodes: ["CENSAL_036"],
      requiredDocuments: [],
      verificationMethod: "NIF-IVA validado en VIES.",
    });
  }

  if (profile.nonEuOperations) {
    tasks.push({
      code: "EORI",
      title: "Obligaciones aduaneras y número EORI",
      detail: "Revisar si las operaciones fuera de la Unión Europea exigen registro aduanero y número EORI.",
      authority: "AEAT — Aduanas",
      status: "NOT_STARTED",
      priority: 92,
      dependencyCodes: ["CENSAL_036"],
      requiredDocuments: [],
      verificationMethod: "Confirmación del registro aduanero.",
    });
  }

  tasks.push({
    code: "RETA",
    title: "Alta en el RETA de quienes trabajen por cuenta propia",
    detail:
      "Determinar el encuadramiento de las personas que trabajan en el negocio y tramitar el alta que corresponda.",
    authority: "TGSS / Importass",
    status: "WAITING_USER",
    priority: 95,
    dependencyCodes: ["CENSAL_036"],
    requiredDocuments: ["SOCIAL_SECURITY"],
    verificationMethod: "Resolución de alta en el RETA.",
    sourceUrl: sourceFor("TGSS_INSCRIPCION_EMPRESA"),
  });

  if (profile.willHireWorkers) {
    const inscripcion = statusFor("TGSS_INSCRIPCION_EMPRESA", "READY");
    tasks.push({
      code: "SS_INSCRIPCION",
      title: "Inscripción de la empresa en la Seguridad Social y Código de Cuenta de Cotización",
      detail:
        "Quien contrata por primera vez debe inscribirse como empresario y obtener un Código de Cuenta de Cotización antes de que empiece la actividad de las personas trabajadoras.",
      authority: "TGSS / Importass",
      priority: 100,
      dependencyCodes: ["CENSAL_036"],
      requiredDocuments: ["SOCIAL_SECURITY"],
      verificationMethod: "Resolución de inscripción y Código de Cuenta de Cotización asignado.",
      sourceUrl: sourceFor("TGSS_INSCRIPCION_EMPRESA"),
      ...inscripcion,
    });
  }

  if (profile.hasPremises) {
    tasks.push({
      code: "LOCAL_LICENCIA",
      title: "Licencia o declaración responsable de apertura",
      detail:
        "La administración competente es municipal y varía según comunidad autónoma, municipio, actividad y tipo de local. BUROINSTANT identifica quién es competente; no sustituye su criterio.",
      authority: "Ayuntamiento competente",
      status: "WAITING_USER",
      priority: 110,
      dependencyCodes: [],
      requiredDocuments: ["LICENSE"],
      verificationMethod: "Licencia concedida o declaración responsable presentada con justificante.",
    });
  }

  if (profile.publicConcurrence) {
    tasks.push({
      code: "PUBLICA_CONCURRENCIA",
      title: "Revisión técnica de pública concurrencia",
      detail:
        "Puede exigir proyecto técnico, profesional competente y licencia específica. El alcance depende del ayuntamiento, la actividad, el aforo y las características del local.",
      authority: "Ayuntamiento competente / profesional competente",
      status: "WAITING_USER",
      priority: 115,
      dependencyCodes: ["LOCAL_LICENCIA"],
      requiredDocuments: ["LICENSE"],
      verificationMethod: "Informe o proyecto firmado por profesional competente.",
    });
  }

  if (profile.regulatedActivity) {
    tasks.push({
      code: "ACTIVIDAD_REGULADA",
      title: "Autorizaciones sectoriales de la actividad regulada",
      detail: "Identificar el organismo competente y los requisitos previos de la actividad. Requiere revisión profesional.",
      authority: "Organismo sectorial competente",
      status: "WAITING_USER",
      priority: 118,
      dependencyCodes: [],
      requiredDocuments: ["LICENSE"],
      verificationMethod: "Autorización o inscripción sectorial concedida.",
    });
  }

  tasks.push({
    code: "OPERATIVA",
    title: "Inicio operativo y calendario de obligaciones",
    detail: "Cerrar pendientes, archivar justificantes y activar el calendario de obligaciones periódicas.",
    authority: "BUROINSTANT",
    status: "NOT_STARTED",
    priority: 200,
    dependencyCodes: ["CENSAL_036", "RETA"],
    requiredDocuments: [],
    verificationMethod: "Todas las tareas obligatorias completadas con evidencia.",
  });

  return tasks.sort((a, b) => a.priority - b.priority);
}
