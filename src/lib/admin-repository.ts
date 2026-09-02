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
