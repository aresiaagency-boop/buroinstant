import { db, toDatabaseJson } from "@/lib/db";

/**
 * Consultas del panel de superadministración.
 *
 * Se mantienen separadas de `repository.ts` a propósito: aquellas están acotadas
 * al espacio de trabajo de quien las llama, y éstas atraviesan toda la
 * plataforma. Cada función de escritura deja rastro en `admin_audit_events`.
 */

export type AccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  account_status: AccountStatus;
  created_at: string;
  last_seen_at: string | null;
  suspended_reason: string | null;
  workspaces: number;
  projects: number;
  whatsapp_linked: boolean;
};

export type PlatformTotals = {
  users: number;
  pendingUsers: number;
  suspendedUsers: number;
  workspaces: number;
  projects: number;
  ingestionLast7d: number;
  pendingConfirmations: number;
  officialQueries: number;
};

export async function readPlatformTotals(): Promise<PlatformTotals> {
  const sql = db();
  const [row] = await sql<
    Array<{
      users: string;
      pending_users: string;
      suspended_users: string;
      workspaces: string;
      projects: string;
      ingestion_last_7d: string;
      pending_confirmations: string;
      official_queries: string;
    }>
  >`
    select
      (select count(*) from users)::text as users,
      (select count(*) from users where account_status = 'PENDING')::text as pending_users,
      (select count(*) from users where account_status = 'SUSPENDED')::text as suspended_users,
      (select count(*) from workspaces)::text as workspaces,
      (select count(*) from business_projects)::text as projects,
      (select count(*) from data_ingestion_events where created_at > now() - interval '7 days')::text as ingestion_last_7d,
      (select count(*) from data_ingestion_events where status = 'NEEDS_CONFIRMATION')::text as pending_confirmations,
      (select count(*) from official_queries)::text as official_queries
  `;
  return {
    users: Number(row?.users ?? 0),
    pendingUsers: Number(row?.pending_users ?? 0),
    suspendedUsers: Number(row?.suspended_users ?? 0),
    workspaces: Number(row?.workspaces ?? 0),
    projects: Number(row?.projects ?? 0),
    ingestionLast7d: Number(row?.ingestion_last_7d ?? 0),
    pendingConfirmations: Number(row?.pending_confirmations ?? 0),
    officialQueries: Number(row?.official_queries ?? 0),
  };
}

export async function listUsers(limit = 100): Promise<AdminUser[]> {
  const sql = db();
  return sql<AdminUser[]>`
    select
      u.id,
      u.email,
      u.full_name,
      u.account_status,
      u.created_at,
      u.last_seen_at,
      u.suspended_reason,
      (select count(*) from workspace_members m where m.user_id = u.id)::int as workspaces,
      (select count(*) from business_projects p
         join workspace_members m on m.workspace_id = p.workspace_id
        where m.user_id = u.id)::int as projects,
      exists (
        select 1 from user_contact_methods c
         where c.user_id = u.id and c.type = 'WHATSAPP' and c.verified = true
      ) as whatsapp_linked
    from users u
    order by u.created_at desc
    limit ${limit}
  `;
}

export async function listWorkspaces(limit = 100) {
  const sql = db();
  return sql<
    Array<{
      id: string;
      name: string;
      created_at: string;
      owner_email: string | null;
      members: number;
      projects: number;
    }>
  >`
    select
      w.id,
      w.name,
      w.created_at,
      (select u.email from users u where u.id = w.created_by) as owner_email,
      (select count(*) from workspace_members m where m.workspace_id = w.id)::int as members,
      (select count(*) from business_projects p where p.workspace_id = w.id)::int as projects
    from workspaces w
    order by w.created_at desc
    limit ${limit}
  `;
}

export async function listProjectsOverview(limit = 100) {
  const sql = db();
  return sql<
    Array<{
      id: string;
      name: string;
      case_stage: string;
      review_state: string | null;
      workspace_name: string;
      owner_email: string | null;
      updated_at: string;
      pending_fields: number;
    }>
  >`
    select
      p.id,
      p.name,
      p.case_stage,
      c.review_state,
      w.name as workspace_name,
      (select u.email from users u where u.id = p.created_by) as owner_email,
      p.updated_at,
      (select count(*) from data_ingestion_events e
        where e.project_id = p.id and e.status = 'NEEDS_CONFIRMATION')::int as pending_fields
    from business_projects p
    join workspaces w on w.id = p.workspace_id
    left join formation_cases c on c.project_id = p.id
    order by p.updated_at desc
    limit ${limit}
  `;
}

export async function listIngestionEvents(limit = 60) {
  const sql = db();
  return sql<
    Array<{
      id: string;
      channel: string;
      input_type: string;
      status: string;
      confidence: string | null;
      requires_confirmation: boolean;
      normalized_text: string;
      extracted_data: unknown;
      created_at: string;
      project_name: string | null;
      user_email: string | null;
    }>
  >`
    select
      e.id, e.channel, e.input_type, e.status, e.confidence, e.requires_confirmation,
      e.normalized_text, e.extracted_data, e.created_at,
      p.name as project_name,
      u.email as user_email
    from data_ingestion_events e
    left join business_projects p on p.id = e.project_id
    left join users u on u.id = e.user_id
    order by e.created_at desc
    limit ${limit}
  `;
}

export async function listOfficialQueries(limit = 60) {
  const sql = db();
  return sql<
    Array<{
      id: string;
      question: string;
      answer: string | null;
      statement_authority: string;
      confidence: string | null;
      status: string;
      quality_flag: string | null;
      created_at: string;
    }>
  >`
    select id, question, answer, statement_authority, confidence, status, quality_flag, created_at
    from official_queries
    order by created_at desc
    limit ${limit}
  `;
}

export async function readAdminAuditTrail(limit = 40) {
  const sql = db();
  return sql<
    Array<{
      id: string;
      actor_email: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      created_at: string;
    }>
  >`
    select id, actor_email, action, entity_type, entity_id, created_at
    from admin_audit_events
    order by created_at desc
    limit ${limit}
  `;
}

export async function recordAdminAction(input: {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}) {
  const sql = db();
  await sql`
    insert into admin_audit_events (
      actor_email, action, entity_type, entity_id, before_data, after_data, request_id
    ) values (
      ${input.actorEmail}, ${input.action}, ${input.entityType}, ${input.entityId ?? null},
      ${input.before === undefined ? null : sql.json(toDatabaseJson(input.before))},
      ${input.after === undefined ? null : sql.json(toDatabaseJson(input.after))},
      ${input.requestId ?? null}
    )
  `;
}

export async function setUserAccountStatus(input: {
  userId: string;
  status: AccountStatus;
  reason?: string | null;
  actorEmail: string;
}) {
  const sql = db();
  const [before] = await sql<Array<{ account_status: string; email: string }>>`
    select account_status, email from users where id = ${input.userId}
  `;
  if (!before) throw new Error("USER_NOT_FOUND");

  await sql`
    update users
    set account_status = ${input.status},
        suspended_at = ${input.status === "SUSPENDED" ? new Date() : null},
        suspended_reason = ${input.status === "SUSPENDED" ? (input.reason ?? null) : null},
        updated_at = now()
    where id = ${input.userId}
  `;

  await recordAdminAction({
    actorEmail: input.actorEmail,
    action: `USER_${input.status}`,
    entityType: "user",
    entityId: input.userId,
    before: { accountStatus: before.account_status },
    after: { accountStatus: input.status, reason: input.reason ?? null },
  });

  return { email: before.email, previousStatus: before.account_status };
}

export async function deleteUser(input: { userId: string; actorEmail: string }) {
  const sql = db();
  const [before] = await sql<Array<{ email: string; account_status: string }>>`
    select email, account_status from users where id = ${input.userId}
  `;
  if (!before) throw new Error("USER_NOT_FOUND");

  // Una persona que creó espacios de trabajo no se puede borrar sin decidir qué
  // ocurre con los expedientes: se bloquea y se explica, en vez de romper claves
  // ajenas o perder datos en silencio.
  const [owned] = await sql<Array<{ total: string }>>`
    select count(*)::text as total from workspaces where created_by = ${input.userId}
  `;
  if (Number(owned?.total ?? 0) > 0) {
    throw new Error("USER_OWNS_WORKSPACES");
  }

  await sql`delete from users where id = ${input.userId}`;
  await recordAdminAction({
    actorEmail: input.actorEmail,
    action: "USER_DELETED",
    entityType: "user",
    entityId: input.userId,
    before: { email: before.email, accountStatus: before.account_status },
  });
  return { email: before.email };
}

export async function setQualityFlag(input: {
  queryId: string;
  flag: "CORRECT" | "PARTIAL" | "INCORRECT" | "OUTDATED_SOURCE";
  actorEmail: string;
}) {
  const sql = db();
  await sql`
    update official_queries
    set quality_flag = ${input.flag}, reviewed_at = now(), updated_at = now()
    where id = ${input.queryId}
  `;
  await recordAdminAction({
    actorEmail: input.actorEmail,
    action: "QUALITY_FLAGGED",
    entityType: "official_query",
    entityId: input.queryId,
    after: { flag: input.flag },
  });
}

/** Marca de actividad, para saber quién sigue usando la plataforma. */
export async function touchLastSeen(email: string) {
  const sql = db();
  await sql`update users set last_seen_at = now() where lower(email) = lower(${email})`;
}

/* ───────────────────────────── Un expediente entero ────────────────────── */

export type ProjectDossier = {
  project: {
    id: string;
    name: string;
    businessDescription: string;
    legalForm: string | null;
    caseStage: string;
    createdAt: string;
    updatedAt: string;
    workspaceId: string;
    workspaceName: string;
    ownerEmail: string;
  };
  profile: Record<string, unknown>;
  tasks: Array<{ code: string; title: string; status: string; authority: string | null; evidence: string | null }>;
  documents: Array<{
    id: string;
    displayName: string;
    category: string;
    mimeType: string;
    sizeBytes: number;
    reviewStatus: string;
    createdAt: string;
  }>;
  events: Array<{ eventType: string; occurredAt: string; payload: Record<string, unknown> }>;
  contacts: Array<{ channel: string; maskedValue: string; verified: boolean }>;
};

/**
 * Todo lo que el expediente sabe de una empresa en construcción, para poder
 * mirarlo desde el control sin entrar en la cuenta de nadie.
 *
 * De los documentos se leen los metadatos: nombre, tipo, tamaño y estado. El
 * contenido NO se descifra aquí. Poder auditar el expediente no es lo mismo que
 * poder leer el DNI de una persona, y esa distinción se mantiene en el código.
 */
export async function readProjectDossier(projectId: string): Promise<ProjectDossier | null> {
  const sql = db();
  const [project] = await sql<
    Array<{
      id: string;
      name: string;
      business_description: string;
      preferred_legal_form: string | null;
      case_stage: string;
      created_at: Date;
      updated_at: Date;
      workspace_id: string;
      workspace_name: string;
      owner_email: string;
    }>
  >`
    select p.id, p.name, p.business_description, p.preferred_legal_form, p.case_stage,
           p.created_at, p.updated_at, p.workspace_id,
           w.name as workspace_name, u.email as owner_email
    from business_projects p
    join workspaces w on w.id = p.workspace_id
    join users u on u.id = p.created_by
    where p.id = ${projectId}
    limit 1
  `;
  if (!project) return null;

  const [locations, founders, tasks, documents, events, contacts] = await Promise.all([
    sql<Array<{ location_type: string; municipality: string | null }>>`
      select location_type, municipality from business_locations where project_id = ${projectId}
    `,
    sql<Array<{ id: string }>>`select id from founders where project_id = ${projectId}`,
    sql<Array<{ code: string; title: string; status: string; authority: string | null; evidence: string | null }>>`
      select code, title, status, authority, evidence from tasks
      where project_id = ${projectId} order by priority asc
    `,
    sql<
      Array<{
        id: string;
        display_name: string;
        category: string;
        mime_type: string;
        size_bytes: string | number;
        review_status: string;
        created_at: Date;
      }>
    >`
      select id, display_name, category, mime_type, size_bytes, review_status, created_at
      from documents where project_id = ${projectId} order by created_at desc
    `,
    sql<Array<{ event_type: string; occurred_at: Date; payload: Record<string, unknown> }>>`
      select event_type, occurred_at, payload from case_events
      where project_id = ${projectId} order by occurred_at desc limit 30
    `,
    sql<Array<{ type: string; normalized_value: string; verified: boolean; verified_at: Date | null }>>`
      select c.type, c.normalized_value, c.verified, c.verified_at
      from user_contact_methods c
      join business_projects p on p.created_by = c.user_id
      where p.id = ${projectId}
    `,
  ]);

  const actividad = locations.find((l) => l.location_type === "ACTIVITY_ADDRESS");
  return {
    project: {
      id: project.id,
      name: project.name,
      businessDescription: project.business_description,
      legalForm: project.preferred_legal_form,
      caseStage: project.case_stage,
      createdAt: project.created_at.toISOString(),
      updatedAt: project.updated_at.toISOString(),
      workspaceId: project.workspace_id,
      workspaceName: project.workspace_name,
      ownerEmail: project.owner_email,
    },
    profile: {
      business_description: project.business_description,
      preferred_legal_form: project.preferred_legal_form,
      number_of_founders: founders.length || null,
      municipality: actividad?.municipality ?? null,
      physical_premises: locations.some((l) => l.location_type === "ACTIVITY_ADDRESS"),
    },
    tasks,
    documents: documents.map((d) => ({
      id: d.id,
      displayName: d.display_name,
      category: d.category,
      mimeType: d.mime_type,
      sizeBytes: Number(d.size_bytes),
      reviewStatus: d.review_status,
      createdAt: d.created_at.toISOString(),
    })),
    events: events.map((e) => ({
      eventType: e.event_type,
      occurredAt: e.occurred_at.toISOString(),
      payload: e.payload,
    })),
    // El contacto se muestra enmascarado: para auditar basta saber que existe.
    contacts: contacts.map((c) => ({
      channel: c.type,
      maskedValue:
        c.type === "WHATSAPP" || c.type === "SMS" || c.type === "PHONE"
          ? `••• ••• ${String(c.normalized_value).replace(/\D/g, "").slice(-3)}`
          : String(c.normalized_value).replace(/^(.).*(@.*)$/, "$1•••$2"),
      verified: c.verified === true || c.verified_at !== null,
    })),
  };
}

/**
 * Borra un expediente entero. Es irreversible y arrastra por clave ajena sus
 * documentos, trámites, eventos y el contenido cifrado: por eso exige escribir
 * el nombre del expediente, y queda registrado quién lo hizo y qué había.
 */
export async function deleteProject(input: {
  projectId: string;
  confirmationName: string;
  actorEmail: string;
}) {
  const sql = db();
  const [before] = await sql<Array<{ name: string; workspace_id: string; case_stage: string }>>`
    select name, workspace_id, case_stage from business_projects where id = ${input.projectId}
  `;
  if (!before) throw new Error("PROJECT_NOT_FOUND");
  if (before.name.trim() !== input.confirmationName.trim()) throw new Error("CONFIRMATION_MISMATCH");

  const [counts] = await sql<Array<{ documents: string; tasks: string }>>`
    select
      (select count(*)::text from documents where project_id = ${input.projectId}) as documents,
      (select count(*)::text from tasks where project_id = ${input.projectId}) as tasks
  `;

  await sql`delete from business_projects where id = ${input.projectId}`;
  await recordAdminAction({
    actorEmail: input.actorEmail,
    action: "PROJECT_DELETED",
    entityType: "project",
    entityId: input.projectId,
    before: {
      name: before.name,
      caseStage: before.case_stage,
      workspaceId: before.workspace_id,
      documents: Number(counts?.documents ?? 0),
      tasks: Number(counts?.tasks ?? 0),
    },
  });
  return { name: before.name, documents: Number(counts?.documents ?? 0) };
}
