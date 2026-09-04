import { daysUntil, type ObligationOccurrence } from "@/lib/obligations-calendar";

/**
 * Avisos antes de que venza un plazo.
 *
 * Un recargo por presentar tarde se paga aunque la declaración salga a cero, y
 * casi siempre se paga por no haberse enterado. Esto avisa antes.
 *
 * Cuatro reglas gobiernan qué sale de aquí:
 *   1. No se avisa de una fecha que no está confirmada. Una obligación sin
 *      plazo cerrado no genera aviso: mandar «creo que era por ahí» es peor que
 *      no mandar nada.
 *   2. Un aviso por obligación y ventana. Que la tarea programada se ejecute
 *      dos veces no puede traducirse en dos mensajes.
 *   3. No se avisa de lo que ya venció. Llegado el día, el aviso ya no evita
 *      nada y sólo genera ruido.
 *   4. El mensaje dice el modelo, la fecha, quién responde y la sede oficial.
 *      Sin fuente no se manda.
 */

/** Cuántos días antes se avisa. De más lejos a más cerca. */
export const REMINDER_WINDOWS = [10, 3, 1] as const;
export type ReminderWindow = (typeof REMINDER_WINDOWS)[number];

export type PlannedReminder = {
  /** Identidad del aviso: obligación + ventana. Es lo que impide duplicarlo. */
  key: string;
  occurrenceCode: string;
  obligationCode: string;
  window: ReminderWindow;
  dueDate: string;
  daysLeft: number;
  message: string;
};

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

function fechaLarga(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} de ${MESES[month - 1]}`;
}

function cuandoEnPalabras(days: number): string {
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  return `vence en ${days} días`;
}

const RESPONSABLE: Record<string, string> = {
  AUTONOMO: "Lo presentas tú",
  EMPRESA: "Lo presenta la empresa",
  ADMINISTRADOR: "Responde el administrador",
};

/**
 * El mensaje tal y como llega al teléfono. Corto, con el dato que hace falta
 * para actuar y el enlace a la sede: nadie lee un párrafo en WhatsApp.
 */
export function reminderMessage(occurrence: ObligationOccurrence, daysLeft: number): string {
  const cabecera = occurrence.model
    ? `Modelo ${occurrence.model} · ${occurrence.title}`
    : occurrence.title;
  const responsable = RESPONSABLE[occurrence.responsible] ?? "";

  return [
    `⏳ ${cabecera}`,
    `${occurrence.periodLabel} · ${cuandoEnPalabras(daysLeft)}, el ${fechaLarga(occurrence.dueDate ?? "")}.`,
    responsable ? `${responsable}. Organismo: ${occurrence.authority}.` : `Organismo: ${occurrence.authority}.`,
    occurrence.windowRule,
    `Fuente: ${occurrence.sourceUrl}`,
    "",
    "Abre tu expediente en BUROINSTANT y lo dejas resuelto: https://buroinstant.vercel.app/app",
  ]
    .filter(Boolean)
    .join("\n");
}

export type PlanInput = {
  occurrences: ObligationOccurrence[];
  /** Fecha desde la que se mira, en ISO. */
  today: string;
  /** Claves de avisos ya enviados, para no repetirlos. */
  alreadySent: ReadonlySet<string>;
};

export function reminderKey(occurrenceCode: string, window: number): string {
  return `${occurrenceCode}#${window}`;
}

/**
 * Decide qué avisos tocan hoy. Devuelve como mucho uno por obligación: si dos
 * ventanas coinciden, gana la más cercana al vencimiento, que es la que urge.
 */
export function planReminders(input: PlanInput): PlannedReminder[] {
  const salida: PlannedReminder[] = [];

  for (const occurrence of input.occurrences) {
    // Regla 1: sin fecha confirmada, no hay aviso.
    if (!occurrence.dueDate) continue;
    // Regla 4: sin fuente oficial, no hay aviso.
    if (!occurrence.sourceUrl) continue;

    const daysLeft = daysUntil(occurrence.dueDate, input.today);
    // Regla 3: lo vencido ya no se avisa.
    if (daysLeft < 0) continue;

    // De las ventanas que ya se han alcanzado, la más próxima al vencimiento.
    const alcanzadas = REMINDER_WINDOWS.filter((window) => daysLeft <= window);
    const window = alcanzadas.length > 0 ? Math.min(...alcanzadas) : null;
    if (window === null) continue;

    const key = reminderKey(occurrence.code, window);
    // Regla 2: un aviso por obligación y ventana.
    if (input.alreadySent.has(key)) continue;

    salida.push({
      key,
      occurrenceCode: occurrence.code,
      obligationCode: occurrence.obligationCode,
      window: window as ReminderWindow,
      dueDate: occurrence.dueDate,
      daysLeft,
      message: reminderMessage(occurrence, daysLeft),
    });
  }

  return salida.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Cuando toca avisar de varias cosas el mismo día, se manda un solo mensaje.
 * Tres mensajes seguidos de un mismo remitente se leen como spam y se silencian,
 * y entonces el aviso deja de servir para lo único que sirve.
 */
export function digestMessage(reminders: PlannedReminder[]): string {
  if (reminders.length === 0) return "";
  if (reminders.length === 1) return reminders[0].message;

  const lineas = reminders.map((reminder) => {
    const [cabecera, cuando] = reminder.message.split("\n");
    return `• ${cabecera.replace("⏳ ", "")}\n  ${cuando}`;
  });

  return [
    `⏳ Tienes ${reminders.length} plazos cerca:`,
    "",
    ...lineas,
    "",
    "Los tienes todos con su fecha, quién responde y la sede oficial en tu expediente:",
    "https://buroinstant.vercel.app/app",
  ].join("\n");
}
