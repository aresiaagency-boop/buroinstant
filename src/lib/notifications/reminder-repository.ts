import { db } from "@/lib/db";
import {
  digestMessage,
  planReminders,
  type PlannedReminder,
} from "@/lib/notifications/deadline-reminders";
import { SendFailedError, isSenderConfigured, sendWhatsApp } from "@/lib/notifications/whatsapp-sender";
import { upcomingObligations } from "@/lib/obligations-calendar";
import type { ProjectProfile } from "@/lib/task-engine";

/**
 * La pasada diaria de avisos.
 *
 * Recorre los expedientes que tienen un WhatsApp verificado, calcula qué plazos
 * están cerca y manda un solo mensaje por persona. Todo lo enviado queda
 * anotado, de modo que un reintento de la tarea programada no se convierte en
 * un segundo mensaje.
 *
 * Lo que NO hace, a propósito:
 *   · No manda a un número sin verificar. La única prueba de que un teléfono es
 *     de alguien es que esa persona escribiera desde él.
 *   · No registra el teléfono ni el cuerpo del mensaje. La traza guarda qué
 *     obligación se avisó y cuándo; con eso se audita sin guardar datos
 *     personales de más.
 */

export type ReminderRunResult = {
  projectsChecked: number;
  peopleNotified: number;
  remindersSent: number;
  failures: number;
  skippedNoChannel: number;
};

type Candidate = {
  projectId: string;
  workspaceId: string;
  userId: string;
  phone: string;
  legalForm: string | null;
  hasPremises: boolean;
  founders: number;
  /** Desde cuándo corren los plazos de esta empresa, si ya lo ha declarado. */
  activityStart?: string;
  /** Cuándo aprobó la junta las últimas cuentas, si ya consta. */
  accountsApproval?: string;
};

/** Una fecha de base de datos, en ISO corto, o nada si no la hay. */
function comoFecha(valor: Date | string | null): string | undefined {
  if (!valor) return undefined;
  return String(valor instanceof Date ? valor.toISOString().slice(0, 10) : valor).slice(0, 10);
}

/** Expedientes cuyo titular tiene un WhatsApp verificado. */
async function readCandidates(limit: number): Promise<Candidate[]> {
  const sql = db();
  const rows = await sql<
    Array<{
      project_id: string;
      workspace_id: string;
      user_id: string;
      phone: string;
      preferred_legal_form: string | null;
      activity_start_date: Date | string | null;
      accounts_approval_date: Date | string | null;
      premises: string | number;
      founders: string | number;
    }>
  >`
    select p.id as project_id, p.workspace_id, u.id as user_id,
           c.normalized_value as phone, p.preferred_legal_form,
           p.activity_start_date, p.accounts_approval_date,
           (select count(*) from business_locations l
             where l.project_id = p.id and l.location_type = 'ACTIVITY_ADDRESS') as premises,
           (select count(*) from founders f where f.project_id = p.id) as founders
    from business_projects p
    join users u on u.id = p.created_by
    join user_contact_methods c
      on c.user_id = u.id and c.type = 'WHATSAPP' and c.verified = true
    where u.account_status = 'ACTIVE'
    order by p.updated_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    phone: row.phone,
    legalForm: row.preferred_legal_form,
    hasPremises: Number(row.premises) > 0,
    founders: Number(row.founders) || 1,
    activityStart: comoFecha(row.activity_start_date),
    accountsApproval: comoFecha(row.accounts_approval_date),
  }));
}

async function readAlreadySent(projectId: string): Promise<Set<string>> {
  const sql = db();
  const rows = await sql<Array<{ reminder_key: string }>>`
    select reminder_key from deadline_reminders
    where project_id = ${projectId} and status = 'SENT'
  `;
  return new Set(rows.map((row) => row.reminder_key));
}

/**
 * Anota el aviso ANTES de mandarlo. Si se anotara después, un fallo entre el
 * envío y la escritura repetiría el mensaje en la siguiente pasada; así, el
 * peor caso es un aviso de menos, que es el error barato.
 */
async function claim(candidate: Candidate, reminder: PlannedReminder): Promise<boolean> {
  const sql = db();
  const rows = await sql<Array<{ id: string }>>`
    insert into deadline_reminders (
      workspace_id, project_id, user_id, reminder_key, obligation_code,
      due_date, days_before, channel, status
    ) values (
      ${candidate.workspaceId}, ${candidate.projectId}, ${candidate.userId},
      ${reminder.key}, ${reminder.obligationCode}, ${reminder.dueDate},
      ${reminder.window}, 'WHATSAPP', 'SENT'
    )
    on conflict (project_id, reminder_key) do nothing
    returning id
  `;
  return rows.length > 0;
}

async function markFailed(projectId: string, keys: string[], reason: string) {
  if (keys.length === 0) return;
  const sql = db();
  await sql`
    update deadline_reminders
    set status = 'FAILED', failure_reason = ${reason}
    where project_id = ${projectId} and reminder_key = any(${keys})
  `;
}

export async function runDeadlineReminders(options: {
  today?: string;
  limit?: number;
  /** Sin enviar de verdad: calcula y responde qué haría. */
  dryRun?: boolean;
} = {}): Promise<ReminderRunResult> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const candidates = await readCandidates(options.limit ?? 500);

  const resultado: ReminderRunResult = {
    projectsChecked: candidates.length,
    peopleNotified: 0,
    remindersSent: 0,
    failures: 0,
    skippedNoChannel: 0,
  };

  if (!options.dryRun && !isSenderConfigured()) {
    // Sin canal de salida no se anota nada: si se anotara, al configurarlo
    // después esos avisos ya constarían como enviados y nadie los recibiría.
    resultado.skippedNoChannel = candidates.length;
    return resultado;
  }

  for (const candidate of candidates) {
    const profile: Partial<ProjectProfile> = {
      legalForm:
        candidate.legalForm === "SL" ||
        candidate.legalForm === "SLU" ||
        candidate.legalForm === "SA" ||
        candidate.legalForm === "AUTONOMO"
          ? candidate.legalForm
          : null,
      hasPremises: candidate.hasPremises,
      founders: candidate.founders,
    };

    // El panel ya filtraba por la fecha de inicio de actividad y por la
    // aprobación de la junta; esta pasada no, y es la que manda el WhatsApp.
    // Sin pasarlas, se avisaba de un plazo de un período anterior a la empresa:
    // el aviso falso es el que enseña a ignorar los verdaderos.
    const ocurrencias = upcomingObligations({
      profile,
      from: today,
      horizonDays: 30,
      activityStart: candidate.activityStart,
      accountsApproval: candidate.accountsApproval,
    });
    const alreadySent = await readAlreadySent(candidate.projectId);
    const plan = planReminders({ occurrences: ocurrencias, today, alreadySent });
    if (plan.length === 0) continue;

    if (options.dryRun) {
      resultado.peopleNotified += 1;
      resultado.remindersSent += plan.length;
      continue;
    }

    // Se reservan primero: lo que otra ejecución ya reservó no se manda dos veces.
    const reservados: PlannedReminder[] = [];
    for (const reminder of plan) {
      if (await claim(candidate, reminder)) reservados.push(reminder);
    }
    if (reservados.length === 0) continue;

    try {
      await sendWhatsApp({
        phone: candidate.phone,
        text: digestMessage(reservados),
        idempotencyKey: `${candidate.projectId}:${today}`,
      });
      resultado.peopleNotified += 1;
      resultado.remindersSent += reservados.length;
    } catch (error) {
      const motivo = error instanceof SendFailedError ? error.reason : "UNKNOWN";
      await markFailed(
        candidate.projectId,
        reservados.map((r) => r.key),
        motivo,
      );
      resultado.failures += reservados.length;
    }
  }

  return resultado;
}
