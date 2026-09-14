import { db, toDatabaseJson } from "@/lib/db";
import { ensureActorWorkspace } from "@/lib/repository";
import { ProjectAccessError, assertProjectAccess } from "@/lib/task-repository";
import type { Actor } from "@/types/domain";

/**
 * El expediente, guardado de verdad.
 *
 * Hasta ahora los cinco datos del panel vivían en el navegador: se perdían al
 * refrescar, y ni los trámites ni la clasificación por proyecto podían usarse
 * porque no existía un proyecto al que referirse.
 *
 * Cada dato va a la tabla que le corresponde en el esquema, no a un cajón
 * genérico: la actividad y la forma jurídica al proyecto, el municipio y el
 * local a `business_locations`, los socios a `founders`. Así lo que ve el panel,
 * lo que derivan los trámites y lo que lee el agente de WhatsApp son la misma
 * cosa.
 *
 * Cada cambio deja un `case_events`: quién, cuándo y qué valor. El expediente
 * tiene que poder explicarse a sí mismo.
 */

export const PROFILE_KEYS = [
  "business_description",
  "preferred_legal_form",
  "number_of_founders",
  "municipality",
  "physical_premises",
  "activity_start_date",
  "accounts_approval_date",
  "denomination_certified_at",
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type ProjectSnapshot = {
  id: string;
  name: string;
  caseStage: string;
  profile: Partial<Record<ProfileKey, unknown>>;
};

const LEGAL_FORMS = new Set(["SL", "SLU", "AUTONOMO"]);

/** Un nombre provisional legible mientras la persona no elija otro. */
export function projectNameFrom(description: string): string {
  const limpio = description.trim().replace(/\s+/g, " ");
  if (!limpio) return "Mi empresa";
  const corto = limpio.length > 60 ? `${limpio.slice(0, 57).trimEnd()}…` : limpio;
  return corto.charAt(0).toUpperCase() + corto.slice(1);
}

export async function readProjectSnapshot(
  actor: Actor,
  projectId: string,
): Promise<ProjectSnapshot> {
  await assertProjectAccess(actor, projectId);
  return readSnapshotById(projectId);
}

/** Lectura sin comprobar acceso: quien la llama ya lo ha comprobado. */
export async function readSnapshotById(projectId: string): Promise<ProjectSnapshot> {
  const sql = db();

  const [project] = await sql<
    Array<{
      id: string;
      name: string;
      case_stage: string;
      business_description: string;
      preferred_legal_form: string | null;
      activity_start_date: Date | string | null;
      accounts_approval_date: Date | string | null;
      denomination_certified_at: Date | string | null;
    }>
  >`
    select id, name, case_stage, business_description, preferred_legal_form,
           activity_start_date, accounts_approval_date, denomination_certified_at
    from business_projects where id = ${projectId} limit 1
  `;
  if (!project) throw new ProjectAccessError();

  const locations = await sql<Array<{ location_type: string; municipality: string | null }>>`
    select location_type, municipality from business_locations where project_id = ${projectId}
  `;
  const [{ count }] = await sql<Array<{ count: string }>>`
    select count(*)::text as count from founders where project_id = ${projectId}
  `;

  const municipality = locations.find((row) => row.municipality)?.municipality ?? undefined;
  const hasActivityAddress = locations.some((row) => row.location_type === "ACTIVITY_ADDRESS");
  const founders = Number(count);

  return {
    id: project.id,
    name: project.name,
    caseStage: project.case_stage,
    profile: {
      business_description: project.business_description || undefined,
      preferred_legal_form: project.preferred_legal_form ?? undefined,
      number_of_founders: founders > 0 ? founders : undefined,
      municipality,
      // Sin ninguna localización todavía no se sabe: no es lo mismo que "no".
      physical_premises: locations.length > 0 ? hasActivityAddress : undefined,
      // La fecha que declara el 036. Mientras no exista, el calendario no filtra.
      activity_start_date: comoFecha(project.activity_start_date),
      // La fecha en que la junta aprobó las últimas cuentas. Sin ella el
      // depósito sólo puede mostrarse como límite legal, no como tu plazo.
      accounts_approval_date: comoFecha(project.accounts_approval_date),
      // Fecha de expedición de la certificación negativa del RMC. De ella
      // cuelgan los tres meses para firmar y los seis de reserva.
      denomination_certified_at: comoFecha(project.denomination_certified_at),
    },
  };
}

/** Una fecha de base de datos, en ISO corto, o nada si no la hay. */
function comoFecha(valor: Date | string | null): string | undefined {
  if (!valor) return undefined;
  return String(valor instanceof Date ? valor.toISOString().slice(0, 10) : valor).slice(0, 10);
}

/** Devuelve el expediente abierto más reciente, o null si la persona no tiene ninguno. */
export async function readLatestProject(actor: Actor): Promise<ProjectSnapshot | null> {
  const { userId } = await ensureActorWorkspace(actor);
  const sql = db();
  const [row] = await sql<Array<{ id: string }>>`
    select p.id
    from business_projects p
    join workspace_members m on m.workspace_id = p.workspace_id
    where m.user_id = ${userId} and p.archived_at is null
    order by p.updated_at desc
    limit 1
  `;
  if (!row) return null;
  return readProjectSnapshot(actor, row.id);
}

export type ProyectoListado = {
  id: string;
  name: string;
  caseStage: string;
  updatedAt: string;
  archivado: boolean;
};

/** Todos los expedientes de la persona, archivados incluidos y marcados como tales. */
export async function listProjects(actor: Actor): Promise<ProyectoListado[]> {
  const { userId } = await ensureActorWorkspace(actor);
  const sql = db();
  const rows = await sql<
    Array<{ id: string; name: string; case_stage: string; updated_at: Date; archived_at: Date | null }>
  >`
    select p.id, p.name, p.case_stage, p.updated_at, p.archived_at
    from business_projects p
    join workspace_members m on m.workspace_id = p.workspace_id
    where m.user_id = ${userId}
    order by p.archived_at is not null asc, p.updated_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    caseStage: row.case_stage,
    updatedAt: row.updated_at.toISOString(),
    archivado: row.archived_at !== null,
  }));
}

/**
 * Archiva un expediente, o lo devuelve.
 *
 * Archivar no es borrar, y la diferencia importa: un expediente guarda trámites,
 * documentos y trazas de quién hizo qué. Destruir eso por una equivocación de
 * bulto sería peor que el error que se quiere deshacer. Archivado deja de contar
 * como abierto y el panel no lo elige; todo lo demás sigue donde estaba.
 *
 * El último expediente abierto no se archiva: dejar a alguien sin ninguno haría
 * que el panel pareciera vacío, que es exactamente el susto que esto viene a
 * evitar.
 */
export class LastOpenProjectError extends Error {
  constructor() {
    super("LAST_OPEN_PROJECT");
    this.name = "LastOpenProjectError";
  }
}

export async function setProjectArchived(input: {
  actor: Actor;
  projectId: string;
  archivado: boolean;
}): Promise<ProjectSnapshot> {
  const { userId, workspaceId } = await assertProjectAccess(input.actor, input.projectId);
  const sql = db();

  if (input.archivado) {
    const [{ count }] = await sql<Array<{ count: string }>>`
      select count(*)::text as count
      from business_projects
      where workspace_id = ${workspaceId} and archived_at is null
    `;
    if (Number(count) <= 1) throw new LastOpenProjectError();
  }

  await sql`
    update business_projects
    set archived_at = ${input.archivado ? sql`now()` : null}, updated_at = now()
    where id = ${input.projectId}
  `;
  await sql`
    insert into case_events (workspace_id, project_id, event_type, payload, created_by)
    values (
      ${workspaceId}, ${input.projectId}, 'PROFILE_UPDATED',
      ${sql.json(toDatabaseJson({ archivado: input.archivado }))}, ${userId}
    )
  `;

  return readSnapshotById(input.projectId);
}

export type ProfilePatch = Partial<{
  business_description: string;
  preferred_legal_form: string | null;
  number_of_founders: number;
  municipality: string;
  physical_premises: boolean;
  activity_start_date: string | null;
  accounts_approval_date: string | null;
  denomination_certified_at: string | null;
}>;

/**
 * Aplica un cambio del panel al expediente. Crea el proyecto si todavía no
 * existe, para que responder el primer dato ya deje expediente.
 */
export async function saveProjectProfile(input: {
  actor: Actor;
  projectId?: string;
  patch: ProfilePatch;
}): Promise<ProjectSnapshot> {
  const { userId, workspaceId } = await ensureActorWorkspace(input.actor);
  if (input.projectId) await assertProjectAccess(input.actor, input.projectId);
  return applyProfilePatch({
    userId,
    workspaceId,
    projectId: input.projectId,
    patch: input.patch,
  });
}

/**
 * Aplica el cambio con una identidad ya resuelta.
 *
 * La ingesta de WhatsApp llega con el usuario y el workspace que le devolvió la
 * búsqueda del teléfono: no puede pasar por `ensureActorWorkspace`, que crearía
 * un usuario a partir de datos que no tiene.
 */
export async function applyProfilePatch(input: {
  userId: string;
  workspaceId: string;
  projectId?: string;
  patch: ProfilePatch;
}): Promise<ProjectSnapshot> {
  const { userId, workspaceId } = input;
  const sql = db();

  let projectId = input.projectId;

  /*
   * Sin `projectId`, antes se creaba un expediente nuevo sin mirar si ya había
   * uno. Comprobado en producción con el expediente real de A.R.E.S.: una
   * llamada que sólo reguardaba la forma jurídica abrió un segundo expediente
   * vacío, «Mi empresa», que además pasó a ser el más reciente y desplazó al
   * verdadero en el panel. Todo el trabajo seguía ahí, pero dejaba de verse.
   *
   * Un expediente se abre cuando no hay ninguno. Si ya hay uno del mismo
   * workspace, el cambio va a ése: nadie que corrige un dato quiere empezar de
   * cero, y un segundo expediente silencioso es peor que un error.
   */
  if (!projectId) {
    const [abierto] = await sql<Array<{ id: string }>>`
      select id from business_projects
      where workspace_id = ${workspaceId}
      order by updated_at desc
      limit 1
    `;
    if (abierto) projectId = abierto.id;
  }

  if (!projectId) {
    const descripcion = input.patch.business_description?.trim();
    const [created] = await sql<Array<{ id: string }>>`
      insert into business_projects (workspace_id, name, business_description, case_stage, created_by)
      values (
        ${workspaceId},
        ${projectNameFrom(descripcion ?? "")},
        ${descripcion ?? "Expediente iniciado desde el panel"},
        'IDEA',
        ${userId}
      )
      returning id
    `;
    projectId = created.id;
    await sql`
      insert into formation_cases (workspace_id, project_id, stage, created_by)
      values (${workspaceId}, ${projectId}, 'IDEA', ${userId})
    `;
    await sql`
      insert into case_events (workspace_id, project_id, event_type, payload, created_by)
      values (${workspaceId}, ${projectId}, 'PROJECT_CREATED', ${sql.json(toDatabaseJson({ origin: "PANEL" }))}, ${userId})
    `;
  }

  const patch = input.patch;

  if (patch.business_description !== undefined) {
    const descripcion = patch.business_description.trim();
    await sql`
      update business_projects
      set business_description = ${descripcion},
          name = case when name = '' or name is null then ${projectNameFrom(descripcion)} else name end
      where id = ${projectId}
    `;
  }

  if (patch.preferred_legal_form !== undefined) {
    const forma = patch.preferred_legal_form && LEGAL_FORMS.has(patch.preferred_legal_form)
      ? patch.preferred_legal_form
      : null;
    await sql`update business_projects set preferred_legal_form = ${forma} where id = ${projectId}`;
  }

  if (patch.number_of_founders !== undefined) {
    // Se reponen las filas: el panel comunica cuántos son, no quiénes. Los
    // nombres llegan más adelante, cuando hagan falta para la escritura.
    const total = Math.max(1, Math.min(20, Math.trunc(patch.number_of_founders)));
    await sql`delete from founders where project_id = ${projectId}`;
    for (let indice = 0; indice < total; indice += 1) {
      await sql`
        insert into founders (workspace_id, project_id, display_name, founder_type, created_by)
        values (${workspaceId}, ${projectId}, ${`Socio ${indice + 1}`}, 'NATURAL_PERSON', ${userId})
      `;
    }
  }

  if (patch.activity_start_date !== undefined) {
    await sql`
      update business_projects
      set activity_start_date = ${patch.activity_start_date}
      where id = ${projectId}
    `;
  }

  if (patch.accounts_approval_date !== undefined) {
    await sql`
      update business_projects
      set accounts_approval_date = ${patch.accounts_approval_date}
      where id = ${projectId}
    `;
  }

  if (patch.denomination_certified_at !== undefined) {
    await sql`
      update business_projects
      set denomination_certified_at = ${patch.denomination_certified_at}
      where id = ${projectId}
    `;
  }

  if (patch.municipality !== undefined || patch.physical_premises !== undefined) {
    const [existing] = await sql<Array<{ id: string; municipality: string | null }>>`
      select id, municipality from business_locations where project_id = ${projectId} limit 1
    `;
    const municipio = patch.municipality?.trim() ?? existing?.municipality ?? null;
    const tipo =
      patch.physical_premises === true
        ? "ACTIVITY_ADDRESS"
        : patch.physical_premises === false
          ? "TAX_ADDRESS"
          : null;

    if (existing) {
      if (tipo) {
        await sql`
          update business_locations
          set municipality = ${municipio}, location_type = ${tipo}
          where id = ${existing.id}
        `;
      } else {
        await sql`update business_locations set municipality = ${municipio} where id = ${existing.id}`;
      }
    } else {
      await sql`
        insert into business_locations (workspace_id, project_id, location_type, municipality, created_by)
        values (${workspaceId}, ${projectId}, ${tipo ?? "TAX_ADDRESS"}, ${municipio}, ${userId})
      `;
    }
  }

  await sql`
    insert into case_events (workspace_id, project_id, event_type, payload, created_by)
    values (${workspaceId}, ${projectId}, 'PROFILE_UPDATED', ${sql.json(toDatabaseJson(patch))}, ${userId})
  `;
  await sql`update business_projects set updated_at = now() where id = ${projectId}`;

  return readSnapshotById(projectId);
}


export type Proposal = {
  field: ProfileKey;
  value: unknown;
  risk: string;
  channel: string;
  receivedAt: string;
};

/**
 * Lo que llegó por WhatsApp y espera tu confirmación.
 *
 * Un dato con consecuencia legal no entra en el expediente porque alguien lo
 * haya dicho de pasada en un mensaje. Queda aquí hasta que la persona lo
 * confirme desde el panel.
 *
 * Una propuesta desaparece sola cuando el campo ya tiene ese mismo valor: no
 * hace falta descartarla a mano si respondes otra cosa.
 */
export async function readPendingProposals(
  projectId: string,
  profile: Partial<Record<ProfileKey, unknown>>,
): Promise<Proposal[]> {
  const sql = db();
  const rows = await sql<Array<{ extracted_data: unknown; channel: string; created_at: Date }>>`
    select extracted_data, channel, created_at
    from data_ingestion_events
    where project_id = ${projectId} and status = 'NEEDS_CONFIRMATION'
    order by created_at desc
    limit 12
  `;

  const vistos = new Set<string>();
  const propuestas: Proposal[] = [];
  for (const row of rows) {
    const campos = Array.isArray(row.extracted_data) ? row.extracted_data : [];
    for (const campo of campos as Array<Record<string, unknown>>) {
      const field = String(campo.field ?? "") as ProfileKey;
      if (!PROFILE_KEYS.includes(field)) continue;
      if (campo.requiresConfirmation !== true) continue;
      if (vistos.has(field)) continue;
      // Ya respondido con ese mismo valor: la propuesta sobra.
      if (JSON.stringify(profile[field]) === JSON.stringify(campo.value)) continue;
      vistos.add(field);
      propuestas.push({
        field,
        value: campo.value,
        risk: String(campo.risk ?? "MEDIUM_RISK"),
        channel: row.channel,
        receivedAt: row.created_at.toISOString(),
      });
    }
  }
  return propuestas;
}
