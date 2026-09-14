import { fact, isBindingFact } from "@/lib/regulatory-facts";
import type { LegalForm, ProjectProfile } from "@/lib/task-engine";

/**
 * Calendario de obligaciones.
 *
 * El motor de trámites (`task-engine`) resuelve lo que hay que hacer UNA VEZ
 * para que la empresa exista. Este módulo resuelve lo que hay que hacer DESPUÉS
 * una y otra vez: qué modelo, en qué plazo, quién responde y con qué fuente.
 *
 * Tres reglas gobiernan el resultado:
 *   1. Ninguna obligación nace con fecha si el hecho regulatorio que la sostiene
 *      no está verificado. En ese caso se muestra sin fecha y dice qué falta
 *      comprobar. Antes que una fecha inventada, ninguna fecha.
 *   2. Toda obligación lleva la URL de la fuente oficial que la sostiene. Si el
 *      hecho no tiene fuente, la obligación no se emite.
 *   3. Los festivos autonómicos y locales no están modelados. Sólo se traslada
 *      el vencimiento que cae en sábado o domingo, y cada fecha calculada lo
 *      advierte.
 */

export const PERIODICITIES = ["MENSUAL", "TRIMESTRAL", "ANUAL"] as const;
export type Periodicity = (typeof PERIODICITIES)[number];

export const RESPONSIBLES = ["AUTONOMO", "EMPRESA", "ADMINISTRADOR"] as const;
export type Responsible = (typeof RESPONSIBLES)[number];

export type ObligationOccurrence = {
  /** Identidad estable de la ocurrencia: código de obligación + período. */
  code: string;
  obligationCode: string;
  /** Número de modelo tributario, cuando la obligación es una autoliquidación. */
  model: string | null;
  title: string;
  detail: string;
  authority: string;
  periodicity: Periodicity;
  responsible: Responsible;
  /** Período al que se refiere la presentación: "1T 2026", "Ejercicio 2026", "marzo 2026". */
  periodLabel: string;
  /** Fecha límite en formato ISO (YYYY-MM-DD), o null si el plazo no está confirmado. */
  dueDate: string | null;
  /** Regla de plazo en palabras, siempre presente aunque no haya fecha. */
  windowRule: string;
  sourceUrl: string;
  sourceTitle: string;
  /** Presente sólo cuando la fecha no puede darse por cerrada. */
  pendingVerification?: string;
  /** Presente cuando la fecha se ha movido por caer en fin de semana. */
  shiftNote?: string;
  /**
   * Presente cuando la fecha es el límite legal exterior y no la fecha propia
   * de esta empresa. Un límite sólo puede cumplirse antes, nunca después: quien
   * lo lea tiene que saber que su plazo real puede haber terminado ya.
   */
  limitNote?: string;
  /** Presente cuando la fecha se ha calculado sobre un dato del expediente. */
  anchorNote?: string;
};

type Schedule =
  | { kind: "QUARTERLY"; dayByQuarter: [number, number, number, number]; monthByQuarter: [number, number, number, number] }
  | { kind: "ANNUAL"; month: number; day: number; periodOffset: number }
  | { kind: "MONTHLY_SAME_MONTH" }
  | { kind: "TRIMESTRAL_FIJO"; months: number[]; day: number }
  | { kind: "SIN_FECHA" };

type ObligationDefinition = {
  code: string;
  model: string | null;
  title: string;
  detail: string;
  authority: string;
  periodicity: Periodicity;
  responsible: Responsible;
  factKey: string;
  windowRule: string;
  schedule: Schedule;
  applies: (profile: ProjectProfile) => boolean;
  /**
   * La fecha que produce el calendario es el límite legal exterior, no la fecha
   * de esta empresa. Se dice con estas palabras en cada ocurrencia, y el
   * vencimiento NO se traslada a lunes: mover un límite hacia adelante lo
   * convertiría en una fecha que llega tarde.
   */
  outerLimit?: string;
  /**
   * Si el expediente guarda este dato, la fecha real se cuenta desde él y deja
   * de usarse el límite exterior.
   */
  anchoredOn?: "ACCOUNTS_APPROVAL";
};

const isCompany = (form: LegalForm) => form !== null && form !== "AUTONOMO";

/**
 * Catálogo. Cada entrada apunta a un hecho de `regulatory-facts`; si el hecho
 * desaparece o pierde su fuente, la obligación deja de emitirse sola.
 */
export const OBLIGATION_CATALOG: ObligationDefinition[] = [
  {
    code: "IVA_303",
    model: "303",
    title: "IVA · autoliquidación trimestral",
    detail:
      "Declara el IVA repercutido a tus clientes menos el soportado en tus compras del trimestre, e ingresa la diferencia.",
    authority: "AEAT",
    periodicity: "TRIMESTRAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_IVA_TRIMESTRAL",
    windowRule:
      "Hasta el día 20 del mes siguiente al fin del trimestre. El cuarto trimestre, hasta el 30 de enero.",
    schedule: { kind: "QUARTERLY", monthByQuarter: [4, 7, 10, 1], dayByQuarter: [20, 20, 20, 30] },
    applies: () => true,
  },
  {
    code: "IVA_390",
    model: "390",
    title: "IVA · resumen anual",
    detail: "Resume las cuatro autoliquidaciones del ejercicio. No se ingresa nada con él: es informativo.",
    authority: "AEAT",
    periodicity: "ANUAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_IVA_TRIMESTRAL",
    windowRule: "Hasta el 30 de enero del año siguiente al ejercicio que resume.",
    schedule: { kind: "ANNUAL", month: 1, day: 30, periodOffset: -1 },
    applies: () => true,
  },
  {
    code: "RETENCIONES_111",
    model: "111",
    title: "Retenciones de trabajo y actividades profesionales",
    detail:
      "Ingresa las retenciones de IRPF que hayas practicado en nóminas y en facturas de profesionales durante el trimestre.",
    authority: "AEAT",
    periodicity: "TRIMESTRAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_RETENCIONES_TRIMESTRAL",
    windowRule: "Hasta el día 20 del mes siguiente al fin del trimestre.",
    schedule: { kind: "QUARTERLY", monthByQuarter: [4, 7, 10, 1], dayByQuarter: [20, 20, 20, 20] },
    applies: (profile) => profile.willHireWorkers || isCompany(profile.legalForm),
  },
  {
    code: "RETENCIONES_115",
    model: "115",
    title: "Retenciones por alquiler del local",
    detail:
      "Si pagas un alquiler de local sujeto a retención, este modelo ingresa lo retenido al arrendador durante el trimestre.",
    authority: "AEAT",
    periodicity: "TRIMESTRAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_RETENCIONES_TRIMESTRAL",
    windowRule: "Hasta el día 20 del mes siguiente al fin del trimestre.",
    schedule: { kind: "QUARTERLY", monthByQuarter: [4, 7, 10, 1], dayByQuarter: [20, 20, 20, 20] },
    applies: (profile) => profile.hasPremises,
  },
  {
    code: "IRPF_130",
    model: "130",
    title: "IRPF · pago fraccionado",
    detail:
      "Adelanta a cuenta de la renta anual un porcentaje del beneficio acumulado del año. Sólo lo presenta la persona física en estimación directa.",
    authority: "AEAT",
    periodicity: "TRIMESTRAL",
    responsible: "AUTONOMO",
    factKey: "PLAZO_PAGO_FRACCIONADO_IRPF",
    windowRule:
      "Hasta el día 20 del mes siguiente al fin del trimestre. El cuarto trimestre, hasta el 30 de enero.",
    schedule: { kind: "QUARTERLY", monthByQuarter: [4, 7, 10, 1], dayByQuarter: [20, 20, 20, 30] },
    applies: (profile) => profile.legalForm === "AUTONOMO",
  },
  {
    code: "IS_202",
    model: "202",
    title: "Sociedades · pago fraccionado",
    detail:
      "Adelanta a cuenta del Impuesto sobre Sociedades. Que haya que presentarlo depende de la cifra de negocios y del resultado del ejercicio anterior: confírmalo antes de cada plazo.",
    authority: "AEAT",
    periodicity: "TRIMESTRAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_PAGO_FRACCIONADO_SOCIEDADES",
    windowRule: "Hasta el día 20 de abril, de octubre y de diciembre.",
    schedule: { kind: "TRIMESTRAL_FIJO", months: [4, 10, 12], day: 20 },
    applies: (profile) => isCompany(profile.legalForm),
  },
  {
    code: "IS_200",
    model: "200",
    title: "Impuesto sobre Sociedades · declaración anual",
    detail:
      "Liquida el impuesto del ejercicio cerrado. Con ejercicio igual al año natural el plazo termina en julio; con otro cierre se cuenta desde tu fecha de cierre.",
    authority: "AEAT",
    periodicity: "ANUAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_IMPUESTO_SOCIEDADES",
    windowRule:
      "Los 25 días naturales siguientes a los seis meses posteriores al fin del período impositivo. Con ejercicio natural, hasta el 25 de julio.",
    schedule: { kind: "ANNUAL", month: 7, day: 25, periodOffset: -1 },
    applies: (profile) => isCompany(profile.legalForm),
  },
  {
    code: "TGSS_RETA",
    model: null,
    title: "Cuota de autónomo (RETA)",
    detail:
      "La cuota de cada mes se ingresa dentro de ese mismo mes. Con domiciliación bancaria la Tesorería practica el cargo; conviene comprobar que ha entrado.",
    authority: "Tesorería General de la Seguridad Social",
    periodicity: "MENSUAL",
    responsible: "AUTONOMO",
    factKey: "PLAZO_CUOTA_RETA",
    windowRule: "Dentro del mismo mes al que corresponde la cuota.",
    schedule: { kind: "MONTHLY_SAME_MONTH" },
    applies: (profile) => profile.legalForm === "AUTONOMO",
  },
  {
    code: "SS_ADMINISTRADOR",
    model: null,
    title: "Cotización del administrador en Seguridad Social",
    detail:
      "La sociedad es una S.L.; quien cotiza es la persona que la administra y trabaja en ella. " +
      "Teniendo control efectivo sobre la sociedad y ejerciendo funciones de dirección o gerencia, " +
      "la Seguridad Social la encuadra y hay cuota cada mes, que se ingresa dentro de ese mismo mes. " +
      "Con domiciliación bancaria la Tesorería practica el cargo; conviene comprobar que ha entrado.",
    authority: "Tesorería General de la Seguridad Social",
    periodicity: "MENSUAL",
    responsible: "ADMINISTRADOR",
    factKey: "PLAZO_CUOTA_RETA",
    windowRule: "Dentro del mismo mes al que corresponde la cuota.",
    schedule: { kind: "MONTHLY_SAME_MONTH" },
    // No es la obligación del autónomo persona física con otro nombre: se aplica
    // por un motivo distinto —administrar una sociedad con control efectivo— y la
    // responsable es la persona administradora, no la empresa. Antes esta cuota no
    // aparecía en el calendario de ninguna sociedad, y es un pago mensual: quien
    // creaba una S.L. se enteraba por el banco.
    applies: (profile) => isCompany(profile.legalForm),
  },
  {
    code: "RETENCIONES_190",
    model: "190",
    title: "Resumen anual de retenciones",
    detail:
      "Resume las retenciones de todo el ejercicio declaradas en el modelo 111. Presentándolo por internet, " +
      "que es la vía ordinaria, el plazo va del 1 al 31 de enero del año siguiente.",
    authority: "AEAT",
    periodicity: "ANUAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_RESUMEN_ANUAL_RETENCIONES",
    windowRule:
      "Del 1 al 31 de enero del año siguiente al ejercicio que resume, presentándolo por internet. " +
      "Si el 31 cae en fin de semana, pasa al siguiente día hábil.",
    // Antes esta obligación no tenía fecha, y una obligación sin fecha no genera
    // aviso: el sistema calcula los diez, tres y un día antes sobre una fecha.
    // El artículo 5 de la Orden EHA/3127/2009 sí la fija; verificado en el BOE.
    schedule: { kind: "ANNUAL", month: 1, day: 31, periodOffset: -1 },
    applies: (profile) => profile.willHireWorkers || isCompany(profile.legalForm),
  },
  {
    code: "JUNTA_ORDINARIA",
    model: null,
    title: "Junta general ordinaria · aprobación de las cuentas",
    detail:
      "La junta que aprueba las cuentas del ejercicio anterior tiene que reunirse dentro de los seis " +
      "primeros meses del ejercicio. De su fecha de aprobación arranca el plazo para depositar las cuentas " +
      "en el Registro Mercantil, así que conviene no apurarla.",
    authority: "La sociedad",
    periodicity: "ANUAL",
    responsible: "ADMINISTRADOR",
    factKey: "PLAZO_JUNTA_ORDINARIA",
    windowRule: "Dentro de los seis primeros meses del ejercicio siguiente al que se aprueba.",
    schedule: { kind: "ANNUAL", month: 6, day: 30, periodOffset: -1 },
    outerLimit:
      "El 30 de junio es el último día, no una fecha elegida: la junta puede reunirse antes. " +
      "La fecha se calcula suponiendo el ejercicio cerrado a 31 de diciembre; con otro cierre, " +
      "cuenta seis meses desde el tuyo.",
    // Aprobar las cuentas es lo que desbloquea el depósito, y no aparecía en
    // ningún sitio. Quien creaba una sociedad se encontraba con el depósito
    // fuera de plazo sin haber sabido nunca que antes había una junta.
    applies: (profile) => isCompany(profile.legalForm),
  },
  {
    code: "CUENTAS_ANUALES",
    model: null,
    title: "Depósito de cuentas anuales",
    detail:
      "Las cuentas se depositan en el Registro Mercantil dentro del mes siguiente a que la junta general " +
      "las apruebe. Mientras no se depositan, el Registro no inscribe documentos de la sociedad.",
    authority: "Registro Mercantil",
    periodicity: "ANUAL",
    responsible: "ADMINISTRADOR",
    factKey: "PLAZO_CUENTAS_ANUALES",
    windowRule: "Dentro del mes siguiente a la aprobación por la junta general.",
    schedule: { kind: "ANNUAL", month: 7, day: 30, periodOffset: -1 },
    outerLimit:
      "El 30 de julio es el límite exterior: sale de sumar el mes del artículo 279 al último día en que " +
      "la junta puede reunirse. Si tu junta aprobó antes, tu plazo terminó antes. Anota la fecha de " +
      "aprobación en el expediente y esta fecha se recalcula sobre ella.",
    anchoredOn: "ACCOUNTS_APPROVAL",
    applies: (profile) => isCompany(profile.legalForm),
  },
];

/* ------------------------------------------------------------------ fechas */

const MESES = [
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

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 domingo · 6 sábado, calculado en UTC para no depender del huso del servidor. */
function weekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/**
 * Traslada al lunes el vencimiento que cae en sábado o domingo. Los festivos
 * nacionales, autonómicos y locales NO están modelados: por eso toda fecha
 * trasladada sale acompañada de una advertencia.
 */
function shiftOffWeekend(isoDate: string): { date: string; shifted: boolean } {
  const day = weekday(isoDate);
  if (day !== 0 && day !== 6) return { date: isoDate, shifted: false };
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + (day === 6 ? 2 : 1));
  return { date: base.toISOString().slice(0, 10), shifted: true };
}

const AVISO_FESTIVOS =
  "Fecha trasladada porque el vencimiento caía en fin de semana. Los festivos autonómicos y locales no están aplicados: confirma el día en el calendario oficial.";

/* --------------------------------------------------------------- generación */

type RawOccurrence = { periodLabel: string; year: number; month: number; day: number };

function occurrencesForYear(schedule: Schedule, year: number): RawOccurrence[] {
  switch (schedule.kind) {
    case "QUARTERLY":
      return [0, 1, 2, 3].map((index) => {
        const month = schedule.monthByQuarter[index];
        // El cuarto trimestre se presenta ya en el año siguiente.
        const dueYear = month === 1 ? year + 1 : year;
        return {
          periodLabel: `${index + 1}T ${year}`,
          year: dueYear,
          month,
          day: schedule.dayByQuarter[index],
        };
      });
    case "TRIMESTRAL_FIJO":
      return schedule.months.map((month) => ({
        periodLabel: `${MESES[month - 1]} ${year}`,
        year,
        month,
        day: schedule.day,
      }));
    case "ANNUAL":
      return [
        {
          periodLabel: `Ejercicio ${year + schedule.periodOffset}`,
          year,
          month: schedule.month,
          day: schedule.day,
        },
      ];
    case "MONTHLY_SAME_MONTH":
      return Array.from({ length: 12 }, (_, index) => ({
        periodLabel: `${MESES[index]} ${year}`,
        year,
        month: index + 1,
        day: lastDayOfMonth(year, index + 1),
      }));
    case "SIN_FECHA":
      return [{ periodLabel: `Ejercicio ${year}`, year, month: 0, day: 0 }];
  }
}

function addDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Un mes natural más tarde, en el sentido del «mes siguiente» del artículo 279:
 * mismo día del mes que viene, y si ese día no existe, el último del mes. Del 31
 * de enero sale el 28 de febrero, no el 3 de marzo; desbordar al mes siguiente
 * daría un plazo más largo que el que da la ley.
 */
function addOneMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const siguienteMes = month === 12 ? 1 : month + 1;
  const siguienteAno = month === 12 ? year + 1 : year;
  const tope = lastDayOfMonth(siguienteAno, siguienteMes);
  return iso(siguienteAno, siguienteMes, Math.min(day, tope));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_CALENDAR_PROFILE: ProjectProfile = {
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

export type CalendarInput = {
  profile: Partial<ProjectProfile>;
  /** Fecha desde la que se mira, en ISO. Por defecto, hoy en UTC. */
  from?: string;
  /** Cuántos días hacia adelante. Por defecto 365. */
  horizonDays?: number;
  /**
   * Fecha de inicio de actividad declarada en el modelo 036, en ISO.
   *
   * Sin ella el calendario muestra vencimientos de períodos en los que la
   * empresa todavía no existía. Comprobado con A.R.E.S.: constituyéndose en
   * septiembre, el calendario ofrecía el IVA del tercer trimestre de 2026. Un
   * vencimiento falso entrena a la gente a ignorar los avisos, y entonces el
   * verdadero tampoco se mira.
   *
   * Si no se pasa, no se filtra nada: es mejor mostrar de más que esconder una
   * obligación de una empresa que ya venía funcionando antes de usar la app.
   */
  activityStart?: string;
  /**
   * Fecha en que la junta general aprobó las últimas cuentas anuales, en ISO.
   *
   * Con ella, el depósito de cuentas deja de mostrarse como límite exterior y
   * pasa a tener la fecha de esta sociedad: un mes desde la aprobación. Sin
   * ella, el calendario sólo puede ofrecer el límite, y lo dice.
   */
  accountsApproval?: string;
};

/**
 * Devuelve las obligaciones que vencen en la ventana pedida, ordenadas por
 * fecha. Las que no tienen fecha confirmada van al final, sin inventarla.
 */
export function upcomingObligations(input: CalendarInput): ObligationOccurrence[] {
  const profile = { ...DEFAULT_CALENDAR_PROFILE, ...input.profile } as ProjectProfile;
  const from = input.from ?? new Date().toISOString().slice(0, 10);
  const inicioActividad = input.activityStart?.slice(0, 10);
  const aprobacionCuentas = ISO_DATE.test(input.accountsApproval?.slice(0, 10) ?? "")
    ? input.accountsApproval!.slice(0, 10)
    : undefined;
  const horizon = addDays(from, input.horizonDays ?? 365);
  const years = [Number(from.slice(0, 4)) - 1, Number(from.slice(0, 4)), Number(horizon.slice(0, 4))];
  const uniqueYears = [...new Set(years)];

  const salida: ObligationOccurrence[] = [];

  /**
   * En una persona física no hay «empresa» separada de la persona: quien
   * responde de sus modelos es ella. Decir «la empresa» ahí confunde a quien
   * todavía está decidiendo si constituir sociedad.
   */
  const quienResponde = (responsible: Responsible): Responsible =>
    profile.legalForm === "AUTONOMO" && responsible === "EMPRESA" ? "AUTONOMO" : responsible;

  for (const definition of OBLIGATION_CATALOG) {
    if (!definition.applies(profile)) continue;

    const item = fact(definition.factKey);
    const source = item?.sources[0];
    // Regla 2: sin fuente oficial no se emite la obligación.
    if (!item || !source) continue;

    const verified = isBindingFact(item);
    const pendiente =
      item.verificationNote ??
      "El plazo no está confirmado contra la fuente oficial vigente. Compruébalo antes de actuar.";

    // Regla 1: hecho sin verificar o calendario sin regla de fecha → una sola
    // fila, sin fecha, diciendo qué falta comprobar. Nunca una fecha inventada.
    if (!verified || definition.schedule.kind === "SIN_FECHA") {
      const year = Number(from.slice(0, 4));
      salida.push({
        code: `${definition.code}:SIN_FECHA_${year}`,
        obligationCode: definition.code,
        model: definition.model,
        title: definition.title,
        detail: definition.detail,
        authority: definition.authority,
        periodicity: definition.periodicity,
        responsible: quienResponde(definition.responsible),
        periodLabel: `Ejercicio ${year}`,
        dueDate: null,
        windowRule: definition.windowRule,
        sourceUrl: source.url,
        sourceTitle: `${source.authority} · ${source.title}`,
        pendingVerification: pendiente,
      });
      continue;
    }

    // Una obligación anclada en un dato del expediente produce la fecha de ESTA
    // sociedad, no una del calendario: un mes desde que la junta aprobó. Cuando
    // hay dato propio, el límite exterior sobra.
    if (definition.anchoredOn === "ACCOUNTS_APPROVAL" && aprobacionCuentas) {
      const vencimiento = addOneMonth(aprobacionCuentas);
      if (vencimiento >= from && vencimiento <= horizon) {
        const ejercicio = Number(aprobacionCuentas.slice(0, 4)) - 1;
        salida.push({
          code: `${definition.code}:APROBACION_${aprobacionCuentas}`,
          obligationCode: definition.code,
          model: definition.model,
          title: definition.title,
          detail: definition.detail,
          authority: definition.authority,
          periodicity: definition.periodicity,
          responsible: quienResponde(definition.responsible),
          periodLabel: `Ejercicio ${ejercicio}`,
          dueDate: vencimiento,
          windowRule: definition.windowRule,
          sourceUrl: source.url,
          sourceTitle: `${source.authority} · ${source.title}`,
          anchorNote: `Un mes desde el ${aprobacionCuentas}, la fecha de aprobación que consta en tu expediente.`,
        });
      }
      continue;
    }

    // La cuota de RETA vence «dentro del mismo mes»: trasladarla al lunes la
    // empujaría al mes siguiente y contradiría la propia fuente. Y un límite
    // legal tampoco se traslada: moverlo hacia adelante daría por bueno un día
    // en que el plazo ya habría pasado. Sólo se traslada lo que refleja el
    // calendario de la AEAT, que es quien practica ese traslado.
    const permiteTraslado =
      definition.schedule.kind !== "MONTHLY_SAME_MONTH" && !definition.outerLimit;

    for (const year of uniqueYears) {
      for (const raw of occurrencesForYear(definition.schedule, year)) {
        const nominal = iso(raw.year, raw.month, raw.day);
        const { date, shifted } = permiteTraslado
          ? shiftOffWeekend(nominal)
          : { date: nominal, shifted: false };
        if (date < from || date > horizon) continue;
        // Un plazo anterior al inicio de actividad no es de esta empresa.
        if (inicioActividad && date < inicioActividad) continue;
        const dueDate: string = date;
        const shiftNote = shifted ? AVISO_FESTIVOS : undefined;

        salida.push({
          code: `${definition.code}:${raw.periodLabel.replace(/\s+/g, "_")}`,
          obligationCode: definition.code,
          model: definition.model,
          title: definition.title,
          detail: definition.detail,
          authority: definition.authority,
          periodicity: definition.periodicity,
          responsible: quienResponde(definition.responsible),
          periodLabel: raw.periodLabel,
          dueDate,
          windowRule: definition.windowRule,
          sourceUrl: source.url,
          sourceTitle: `${source.authority} · ${source.title}`,
          ...(shiftNote ? { shiftNote } : {}),
          ...(definition.outerLimit ? { limitNote: definition.outerLimit } : {}),
        });
      }
    }
  }

  return salida.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
}

export type SplitObligations = {
  /** Las que tienen fecha cerrada. Son las únicas que pueden generar aviso. */
  conFecha: ObligationOccurrence[];
  /** Las que no la tienen. No avisan de nada: hay que ir a comprobarlas. */
  sinFecha: ObligationOccurrence[];
};

/**
 * Separa las dos cosas que el panel mezclaba.
 *
 * El sistema de avisos calcula los diez, tres y un día antes sobre una fecha;
 * sin fecha no puede avisar. Mientras las dos listas iban juntas, una obligación
 * sin fecha parecía tan vigilada como las demás, y no lo estaba. Puestas aparte,
 * quien las lee sabe que de ésas responde él.
 */
export function splitByDate(occurrences: ObligationOccurrence[]): SplitObligations {
  const conFecha: ObligationOccurrence[] = [];
  const sinFecha: ObligationOccurrence[] = [];
  for (const item of occurrences) {
    if (item.dueDate) conFecha.push(item);
    else sinFecha.push(item);
  }
  return { conFecha, sinFecha };
}

/** Días que faltan para el vencimiento. Negativo si ya ha pasado. */
export function daysUntil(dueDate: string, from: string): number {
  const a = Date.parse(`${dueDate}T00:00:00Z`);
  const b = Date.parse(`${from}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

export function urgencyOf(occurrence: ObligationOccurrence, from: string): "SIN_FECHA" | "LEJANO" | "PROXIMO" | "INMINENTE" | "VENCIDO" {
  if (!occurrence.dueDate) return "SIN_FECHA";
  const days = daysUntil(occurrence.dueDate, from);
  if (days < 0) return "VENCIDO";
  if (days <= 7) return "INMINENTE";
  if (days <= 30) return "PROXIMO";
  return "LEJANO";
}
