import { db, toDatabaseJson } from "@/lib/db";
import { deriveTasks, type DerivedTask, type ProjectProfile, type TaskStatus } from "@/lib/task-engine";
import { buildCompleteness, type CompletenessReport, type FieldGap } from "@/lib/completeness";
import type { Actor } from "@/types/domain";
import { ensureActorWorkspace } from "@/lib/repository";

/**
 * Persistencia del itinerario. Toda lectura y escritura comprueba antes que la
 * persona pertenece al espacio de trabajo del proyecto: la interfaz no es la
 * frontera de seguridad.
 */

export class ProjectAccessError extends Error {
  constructor() {
    super("PROJECT_NOT_FOUND");
    this.name = "ProjectAccessError";
  }
}

export async function assertProjectAccess(actor: Actor, projectId: string) {
  const { userId } = await ensureActorWorkspace(actor);
  const sql = db();
  const rows = await sql<Array<{ workspace_id: string }>>`
    select p.workspace_id
    from business_projects p
    join workspace_members m on m.workspace_id = p.workspace_id
    where p.id = ${projectId} and m.user_id = ${userId}
    limit 1
  `;
  if (!rows[0]) throw new ProjectAccessError();
  return { userId, workspaceId: rows[0].workspace_id };
}

/** Deriva el perfil del proyecto de lo que ya está guardado. */
export async function readProjectProfile(projectId: string): Promise<Partial<ProjectProfile>> {
  const sql = db();
  const [project] = await sql<Array<{ preferred_legal_form: string | null }>>`
    select preferred_legal_form from business_projects where id = ${projectId} limit 1
  `;
  const locations = await sql<Array<{ location_type: string }>>`
    select location_type from business_locations where project_id = ${projectId}
  `;
  const founders = await sql<Array<{ id: string }>>`
    select id from founders where project_id = ${projectId}
  `;
  const [tax] = await sql<Array<{ profile: Record<string, unknown> }>>`
    select profile from tax_profiles where project_id = ${projectId} limit 1
  `;
  const [social] = await sql<Array<{ profile: Record<string, unknown> }>>`
    select profile from social_security_profiles where project_id = ${projectId} limit 1
  `;

  const taxProfile = tax?.profile ?? {};
  const socialProfile = social?.profile ?? {};
  const form = String(project?.preferred_legal_form ?? "").toUpperCase();

  return {
    legalForm: form === "SL" || form === "SLU" || form === "SA" || form === "AUTONOMO" ? form : null,
    founders: founders.length || 1,
    hasPremises: locations.some((row) => row.location_type === "ACTIVITY_ADDRESS"),
    publicConcurrence: taxProfile.public_concurrence === true,
    willHireWorkers: socialProfile.will_hire_workers === true,
    euOperations: taxProfile.eu_clients === true || taxProfile.eu_suppliers === true,
    nonEuOperations: taxProfile.non_eu_operations === true,
    ecommerce: taxProfile.ecommerce === true,
    regulatedActivity: taxProfile.regulated_activity === true,
    revenueBand:
      taxProfile.expected_first_year_revenue === "OVER_1M"
        ? "OVER_1M"
        : (taxProfile.expected_first_year_revenue as ProjectProfile["revenueBand"]) ?? "UNKNOWN",
  };
}

/** Recalcula el itinerario sin pisar el estado ya alcanzado en cada trámite. */
export async function syncTasks(actor: Actor, projectId: string): Promise<DerivedTask[]> {
  const { userId, workspaceId } = await assertProjectAccess(actor, projectId);
  const profile = await readProjectProfile(projectId);
  const derived = deriveTasks(profile);
  const sql = db();

  for (const task of derived) {
    await sql`
      insert into tasks (
        workspace_id, project_id, code, title, detail, authority, status, priority,
        dependency_codes, required_documents, verification_method, source_url,
        pending_verification, created_by
      ) values (
        ${workspaceId}, ${projectId}, ${task.code}, ${task.title}, ${task.detail}, ${task.authority},
        ${task.status}, ${task.priority}, ${task.dependencyCodes},
        ${sql.json(toDatabaseJson(task.requiredDocuments))}, ${task.verificationMethod},
        ${task.sourceUrl ?? null}, ${task.pendingVerification ?? null}, ${userId}
      )
      on conflict (project_id, code) do update set
        title = excluded.title,
        detail = excluded.detail,
        authority = excluded.authority,
        priority = excluded.priority,
        dependency_codes = excluded.dependency_codes,
        required_documents = excluded.required_documents,
        verification_method = excluded.verification_method,
        source_url = excluded.source_url,
        pending_verification = excluded.pending_verification,
        updated_at = now()
    `;
  }

  return listTasks(actor, projectId);
}

export async function listTasks(actor: Actor, projectId: string): Promise<DerivedTask[]> {
  await assertProjectAccess(actor, projectId);
  const sql = db();
  const rows = await sql<
    Array<{
      code: string;
      title: string;
      detail: string | null;
      authority: string | null;
      status: TaskStatus;
      priority: number;
      dependency_codes: string[];
      required_documents: unknown;
      verification_method: string | null;
      source_url: string | null;
      pending_verification: string | null;
    }>
  >`
    select code, title, detail, authority, status, priority, dependency_codes,
           required_documents, verification_method, source_url, pending_verification
    from tasks
    where project_id = ${projectId}
    order by priority asc
  `;

  return rows.map((row) => ({
    code: row.code,
    title: row.title,
    detail: row.detail ?? "",
    authority: row.authority ?? "",
    status: row.status,
    priority: row.priority,
    dependencyCodes: row.dependency_codes ?? [],
    requiredDocuments: Array.isArray(row.required_documents) ? (row.required_documents as string[]) : [],
    verificationMethod: row.verification_method ?? "",
    sourceUrl: row.source_url ?? undefined,
    pendingVerification: row.pending_verification ?? undefined,
  }));
}

export class EvidenceRequiredError extends Error {
  constructor() {
    super("EVIDENCE_REQUIRED");
    this.name = "EvidenceRequiredError";
  }
}

/** Un trámite no se marca como hecho sin evidencia. La regla vive aquí, no en la interfaz. */
export async function updateTaskStatus(input: {
  actor: Actor;
  projectId: string;
  code: string;
  status: TaskStatus;
  evidence?: string;
}) {
  const { userId, workspaceId } = await assertProjectAccess(input.actor, input.projectId);
  if (input.status === "COMPLETED" && !input.evidence?.trim()) {
    throw new EvidenceRequiredError();
  }

  const sql = db();
  const [before] = await sql<Array<{ status: string }>>`
    select status from tasks where project_id = ${input.projectId} and code = ${input.code} limit 1
  `;
  if (!before) throw new ProjectAccessError();

  await sql`
    update tasks
    set status = ${input.status},
        evidence = ${input.evidence?.trim() ?? null},
        completed_at = ${input.status === "COMPLETED" ? new Date() : null},
        updated_at = now()
    where project_id = ${input.projectId} and code = ${input.code}
  `;

  await sql`
    insert into case_events (workspace_id, project_id, event_type, payload, created_by)
    values (
      ${workspaceId}, ${input.projectId},
      ${input.status === "COMPLETED" ? "TASK_COMPLETED" : "TASK_UPDATED"},
      ${sql.json(toDatabaseJson({ code: input.code, from: before.status, to: input.status }))},
      ${userId}
    )
  `;

  return { previousStatus: before.status };
}

export async function readCompleteness(actor: Actor, projectId: string): Promise<CompletenessReport> {
  const existing = await listTasks(actor, projectId);
  const tasks = existing.length > 0 ? existing : await syncTasks(actor, projectId);
  const profile = await readProjectProfile(projectId);

  const gaps: FieldGap[] = [];
  if (!profile.legalForm) {
    gaps.push({ field: "preferred_legal_form", label: "Forma jurídica", blocking: true });
  }
  if (profile.revenueBand === "UNKNOWN") {
    gaps.push({
      field: "expected_first_year_revenue",
      label: "Facturación estimada del primer año",
      blocking: false,
    });
  }
  return buildCompleteness(tasks, gaps);
}
