import type { Actor, ExtractedField, OrbeInboundMessage } from "@/types/domain";
import { db, toDatabaseJson } from "@/lib/db";

export async function ensureActorWorkspace(actor: Actor) {
  const sql = db();
  return sql.begin(async (transaction) => {
    const [user] = await transaction<[{ id: string }]>`
      insert into users (oauth_subject, email, full_name)
      values (${actor.userId}, ${actor.email}, ${actor.name})
      on conflict (oauth_subject) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          updated_at = now()
      returning id
    `;

    const memberships = await transaction<{ workspace_id: string }[]>`
      select workspace_id
      from workspace_members
      where user_id = ${user.id}
      order by created_at asc
      limit 1
    `;
    if (memberships[0]) return { userId: user.id, workspaceId: memberships[0].workspace_id };

    const [workspace] = await transaction<[{ id: string }]>`
      insert into workspaces (name, created_by)
      values (${`Espacio de ${actor.name}`}, ${user.id})
      returning id
    `;
    await transaction`
      insert into workspace_members (workspace_id, user_id, role, created_by)
      values (${workspace.id}, ${user.id}, 'OWNER', ${user.id})
    `;
    return { userId: user.id, workspaceId: workspace.id };
  });
}

export async function listProjects(actor: Actor) {
  const { userId } = await ensureActorWorkspace(actor);
  const sql = db();
  return sql<
    Array<{
      id: string;
      name: string;
      business_description: string;
      case_stage: string;
      created_at: string;
    }>
  >`
    select p.id, p.name, p.business_description, p.case_stage, p.created_at
    from business_projects p
    join workspace_members membership on membership.workspace_id = p.workspace_id
    where membership.user_id = ${userId}
    order by p.updated_at desc
  `;
}

export async function createProject(
  actor: Actor,
  input: { name: string; businessDescription: string; preferredLanguage: "es" | "en" },
) {
  const { userId, workspaceId } = await ensureActorWorkspace(actor);
  const sql = db();
  return sql.begin(async (transaction) => {
    const [project] = await transaction<[{ id: string; name: string; case_stage: string }]>`
      insert into business_projects (
        workspace_id, name, business_description, preferred_language, case_stage, created_by
      ) values (
        ${workspaceId}, ${input.name}, ${input.businessDescription},
        ${input.preferredLanguage}, 'IDEA', ${userId}
      )
      returning id, name, case_stage
    `;
    await transaction`
      insert into formation_cases (workspace_id, project_id, stage, created_by)
      values (${workspaceId}, ${project.id}, 'IDEA', ${userId})
    `;
    await transaction`
      insert into case_events (workspace_id, project_id, event_type, payload, created_by)
      values (
        ${workspaceId}, ${project.id}, 'PROJECT_CREATED',
        ${transaction.json({ name: project.name })}, ${userId}
      )
    `;
    return project;
  });
}

export async function persistIngestion(input: {
  actor: Actor;
  message: OrbeInboundMessage;
  fields: ExtractedField[];
  projectId?: string;
}) {
  const { userId, workspaceId } = await ensureActorWorkspace(input.actor);
  const sql = db();

  if (input.projectId) {
    const authorized = await sql`
      select 1
      from business_projects p
      join workspace_members membership on membership.workspace_id = p.workspace_id
      where p.id = ${input.projectId}
        and membership.user_id = ${userId}
      limit 1
    `;
    if (!authorized.length) throw new Error("PROJECT_NOT_FOUND");
  }

  const requiresConfirmation = input.fields.some((field) => field.requiresConfirmation);
  await sql`
    insert into data_ingestion_events (
      workspace_id, user_id, project_id, channel, input_type,
      external_message_id, raw_text, normalized_text, extracted_data,
      status, confidence, requires_confirmation, created_by
    ) values (
      ${workspaceId}, ${userId}, ${input.projectId ?? null}, ${input.message.channel},
      ${input.message.inputType}, ${input.message.externalIdentity?.messageId ?? null},
      ${input.message.text}, ${input.message.text.trim()}, ${sql.json(toDatabaseJson(input.fields))},
      ${requiresConfirmation ? "NEEDS_CONFIRMATION" : "APPLIED"},
      ${input.fields.length ? Math.min(...input.fields.map((field) => field.confidence)) : 0},
      ${requiresConfirmation}, ${userId}
    )
  `;
}

export async function resolveWhatsAppIdentity(phone: string) {
  const sql = db();
  const rows = await sql<
    Array<{ user_id: string; workspace_id: string; project_id: string | null }>
  >`
    select contact.user_id,
           membership.workspace_id,
           project.id as project_id
    from user_contact_methods contact
    join workspace_members membership on membership.user_id = contact.user_id
    left join lateral (
      select id
      from business_projects
      where workspace_id = membership.workspace_id
      order by updated_at desc
      limit 1
    ) project on true
    where contact.type = 'WHATSAPP'
      and contact.normalized_value = ${phone}
      and contact.verified = true
    limit 2
  `;
  if (rows.length !== 1) return null;
  return rows[0];
}
