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
  /**
   * De dónde sale el procedimiento de este paso.
   *
   * No todos los pasos tienen una sede oficial detrás, y tratarlos como si la
   * tuvieran producía una advertencia falsa: la carpeta decía «no lleva enlace a
   * fuente oficial verificada» de abrir una cuenta en el banco, que no es un
   * trámite administrativo y nunca va a tener una. La advertencia perdía valor
   * justo donde sí importaba.
   *
   *   · `OFICIAL` — hay norma o sede estatal, y `sourceUrl` la enlaza.
   *   · `SIN_ADMINISTRACION` — lo gestionas tú o un tercero privado. No hay
   *     procedimiento público que enlazar, y eso no es un defecto.
   *   · `LOCAL` — la fuente existe pero depende de tu municipio o de tu
   *     organismo sectorial: una URL única sería falsa para casi todos.
   */
  sourceKind: "OFICIAL" | "SIN_ADMINISTRACION" | "LOCAL";
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

export type SourceKind = DerivedTask["sourceKind"];

/**
 * De dónde sale cada paso. Una sola tabla, porque la consultan dos sitios: el
 * motor cuando deriva el itinerario y el repositorio cuando lo relee de la base
 * de datos. Dos tablas se habrían separado a la primera incorporación.
 *
 * Lo que NO está aquí se trata como `OFICIAL` sin enlace, que es el caso que
 * debe seguir avisando: un trámite ante una administración del que no sabemos
 * decir dónde se presenta.
 */
const FUENTE_POR_TRAMITE: Record<string, SourceKind> = {
  // Lo gestionas tú, o un particular. No hay sede que enlazar, y no es un fallo.
  IDENTITY: "SIN_ADMINISTRACION",
  DOMICILIO_SOCIAL: "SIN_ADMINISTRACION",
  BANCO_CUENTA: "SIN_ADMINISTRACION",
  OPERATIVA: "SIN_ADMINISTRACION",

  // La fuente existe, pero es la de TU ayuntamiento o TU organismo sectorial.
  // Enlazar uno cualquiera sería más engañoso que no enlazar ninguno.
  LOCAL_LICENCIA: "LOCAL",
  PUBLICA_CONCURRENCIA: "LOCAL",
  ACTIVIDAD_REGULADA: "LOCAL",

  // Norma o sede estatal, enlazada en `sourceUrl`.
  ACTIVITY_CLASSIFICATION: "OFICIAL",
  COMPANY_NAME: "OFICIAL",
  BYLAWS: "OFICIAL",
  CAPITAL: "OFICIAL",
  BENEFICIAL_OWNERS: "OFICIAL",
  NOTARY: "OFICIAL",
  NIF_PROVISIONAL: "OFICIAL",
  REGISTRY: "OFICIAL",
  LIBROS_LEGALIZACION: "OFICIAL",
  NIF_DEFINITIVO: "OFICIAL",
  CENSAL_036: "OFICIAL",
  IAE_840_848: "OFICIAL",
  IAE_EXENCION: "OFICIAL",
  ROI_VIES: "OFICIAL",
  EORI: "OFICIAL",
  RETA: "OFICIAL",
  SS_INSCRIPCION: "OFICIAL",
  PRIMERA_FACTURA: "OFICIAL",
};

export function sourceKindFor(code: string): SourceKind {
  return FUENTE_POR_TRAMITE[code] ?? "OFICIAL";
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
  const tasks: Array<Omit<DerivedTask, "sourceKind">> = [];

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
      sourceUrl: sourceFor("RMC_DENOMINACION"),
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
      sourceUrl: sourceFor("LSC_CONSTITUCION_ESCRITURA"),
      },
      {
        code: "DOMICILIO_SOCIAL",
        title: "Domicilio social y autorización para domiciliar",
        detail:
          "Fijar la dirección que constará en la escritura y obtener del titular del inmueble —arrendador, " +
          "coworking o centro de negocios— la autorización expresa para domiciliar en ella la sociedad. " +
          "No todos los coworkings la dan, y sin ella el Registro puede no inscribir.",
        authority: "Titular del inmueble",
        status: "WAITING_USER",
        priority: 35,
        dependencyCodes: [],
        requiredDocuments: ["CONTRACT"],
        verificationMethod: "Contrato o autorización de domiciliación con la dirección exacta.",
      },
      {
        code: "BANCO_CUENTA",
        title: "Cuenta bancaria de la sociedad en constitución",
        detail:
          "Abrir la cuenta a nombre de la sociedad en constitución para ingresar el capital. Es donde más " +
          "se atasca el recorrido: el banco pide papeles que todavía no existen, así que conviene " +
          "empezarlo en cuanto haya denominación concedida.",
        authority: "Entidad bancaria",
        status: "WAITING_USER",
        priority: 45,
        dependencyCodes: ["COMPANY_NAME"],
        requiredDocuments: ["BANK"],
        verificationMethod: "Cuenta abierta a nombre de la sociedad en constitución.",
      },
      {
        code: "CAPITAL",
        title: "Capital social y justificante de aportación",
        detail:
          "Decidir la cifra de capital conociendo sus consecuencias: el mínimo legal es 1 €, pero por debajo de 3.000 € se aplica reserva legal del 20 % del beneficio y responsabilidad solidaria de los socios por la diferencia en caso de liquidación con patrimonio insuficiente.",
        authority: "Notaría / entidad bancaria",
        status: "WAITING_USER",
        priority: 50,
        dependencyCodes: ["BANCO_CUENTA"],
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
        dependencyCodes: ["COMPANY_NAME", "BYLAWS", "CAPITAL", "DOMICILIO_SOCIAL"],
        requiredDocuments: ["NOTARY"],
        verificationMethod: "Copia autorizada de la escritura de constitución.",
      sourceUrl: sourceFor("LSC_CONSTITUCION_ESCRITURA"),
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
      sourceUrl: sourceFor("NIF_ENTIDAD"),
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
      sourceUrl: sourceFor("LSC_CONSTITUCION_ESCRITURA"),
      },
      {
        code: "LIBROS_LEGALIZACION",
        title: "Legalización de libros" + (profile.founders === 1 ? " y libro-registro de socio único" : ""),
        detail:
          "Legalizar los libros obligatorios en el Registro Mercantil. " +
          (profile.founders === 1
            ? "Además, en una sociedad unipersonal los contratos entre el socio único y la sociedad se "
              + "documentan por escrito y se hacen constar en un libro-registro, y se recogen en la memoria "
              + "anual. Si hay licencia de software, préstamo o cualquier acuerdo con la sociedad, esto deja "
              + "de ser teórico desde el primer día."
            : "Comprueba con la notaría o el asesor cuáles corresponden a tu caso."),
        authority: "Registro Mercantil",
        status: "NOT_STARTED",
        priority: 90,
        dependencyCodes: ["REGISTRY"],
        requiredDocuments: ["REGISTRY"],
        verificationMethod: "Justificante de legalización de los libros.",
      sourceUrl: sourceFor("LEGALIZACION_LIBROS"),
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
      sourceUrl: sourceFor("NIF_ENTIDAD"),
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
    sourceUrl: sourceFor("ROI_OPERADORES_INTRACOMUNITARIOS"),
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
    sourceUrl: sourceFor("EORI_OPERADORES"),
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

  /**
   * El paso que cierra el propósito de BUROINSTANT.
   *
   * La aplicación no existe para explicar cómo se crea una empresa: existe para
   * que quede creada y facture. Sin este trámite el itinerario terminaba en
   * «inicio operativo», que no es comprobable ni lo lee nadie como una meta.
   *
   * No se puede emitir antes de tiempo, y por eso depende del alta censal —y en
   * una sociedad, del NIF definitivo—. La fecha de la factura no puede ser
   * anterior a la de inicio de actividad declarada en el 036.
   */
  tasks.push({
    code: "PRIMERA_FACTURA",
    title: "Emitir la primera factura",
    detail:
      "Antes de emitirla tienen que ser ciertas cuatro cosas: NIF definitivo concedido, alta censal "
      + "presentada con su fecha de inicio de actividad, epígrafe confirmado contra la fuente oficial y "
      + "régimen de IVA determinado. El contenido obligatorio de la factura lo fija el Reglamento de "
      + "facturación: compruébalo en la fuente antes de emitirla. Aparte, el Real Decreto 238/2026 "
      + "desarrolla la factura electrónica obligatoria entre empresarios: todavía no obliga a una "
      + "empresa que empieza —su calendario se cuenta desde una orden ministerial de desarrollo—, "
      + "pero conviene elegir herramienta sabiendo que llega.",
    authority: "La empresa",
    status: "NOT_STARTED",
    priority: 210,
    dependencyCodes: isCompany ? ["CENSAL_036", "NIF_DEFINITIVO"] : ["CENSAL_036"],
    requiredDocuments: ["INVOICE"],
    verificationMethod: "Factura emitida, con fecha no anterior al inicio de actividad declarado.",
  sourceUrl: sourceFor("REGLAMENTO_FACTURACION"),
  });

  return tasks
    .map((task) => ({ ...task, sourceKind: sourceKindFor(task.code) }))
    .sort((a, b) => a.priority - b.priority);
}
