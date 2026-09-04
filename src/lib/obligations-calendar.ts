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
    title: "Cuota de autónomos (RETA)",
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
    code: "RETENCIONES_190",
    model: "190",
    title: "Resumen anual de retenciones",
    detail:
      "Resume las retenciones de todo el ejercicio declaradas en el modelo 111. Se presenta en enero.",
    authority: "AEAT",
    periodicity: "ANUAL",
    responsible: "EMPRESA",
    factKey: "PLAZO_RESUMEN_ANUAL_RETENCIONES",
    windowRule: "En enero del año siguiente. El día exacto hay que leerlo en el calendario del ejercicio.",
    schedule: { kind: "SIN_FECHA" },
    applies: (profile) => profile.willHireWorkers || isCompany(profile.legalForm),
  },
  {
    code: "CUENTAS_ANUALES",
    model: null,
    title: "Depósito de cuentas anuales",
    detail:
      "Las cuentas se depositan en el Registro Mercantil dentro del mes siguiente a que la junta general las apruebe.",
    authority: "Registro Mercantil",
    periodicity: "ANUAL",
    responsible: "ADMINISTRADOR",
    factKey: "PLAZO_CUENTAS_ANUALES",
    windowRule: "Dentro del mes siguiente a la aprobación por la junta general.",
    schedule: { kind: "SIN_FECHA" },
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
};

/**
 * Devuelve las obligaciones que vencen en la ventana pedida, ordenadas por
 * fecha. Las que no tienen fecha confirmada van al final, sin inventarla.
 */
export function upcomingObligations(input: CalendarInput): ObligationOccurrence[] {
  const profile = { ...DEFAULT_CALENDAR_PROFILE, ...input.profile } as ProjectProfile;
  const from = input.from ?? new Date().toISOString().slice(0, 10);
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

    // La cuota de RETA vence «dentro del mismo mes»: trasladarla al lunes la
    // empujaría al mes siguiente y contradiría la propia fuente. No se traslada.
    const permiteTraslado = definition.schedule.kind !== "MONTHLY_SAME_MONTH";

    for (const year of uniqueYears) {
      for (const raw of occurrencesForYear(definition.schedule, year)) {
        const nominal = iso(raw.year, raw.month, raw.day);
        const { date, shifted } = permiteTraslado
          ? shiftOffWeekend(nominal)
          : { date: nominal, shifted: false };
        if (date < from || date > horizon) continue;
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
