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
  const sql = db();

  const [project] = await sql<
    Array<{ id: string; name: string; case_stage: string; business_description: string; preferred_legal_form: string | null }>
  >`
    select id, name, case_stage, business_description, preferred_legal_form
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
    },
  };
}

/** Devuelve el expediente abierto más reciente, o null si la persona no tiene ninguno. */
export async function readLatestProject(actor: Actor): Promise<ProjectSnapshot | null> {
  const { userId } = await ensureActorWorkspace(actor);
  const sql = db();
  const [row] = await sql<Array<{ id: string }>>`
    select p.id
    from business_projects p
    join workspace_members m on m.workspace_id = p.workspace_id
    where m.user_id = ${userId}
    order by p.updated_at desc
    limit 1
  `;
  if (!row) return null;
  return readProjectSnapshot(actor, row.id);
}

export type ProfilePatch = Partial<{
  business_description: string;
  preferred_legal_form: string | null;
  number_of_founders: number;
  municipality: string;
  physical_premises: boolean;
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
  const sql = db();

  let projectId = input.projectId;
  if (projectId) {
    await assertProjectAccess(input.actor, projectId);
  } else {
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

  return readProjectSnapshot(input.actor, projectId);
}
