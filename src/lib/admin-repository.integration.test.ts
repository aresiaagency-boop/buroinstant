import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  deleteUser,
  listIngestionEvents,
  listOfficialQueries,
  listProjectsOverview,
  listUsers,
  listWorkspaces,
  readAdminAuditTrail,
  readPlatformTotals,
  setQualityFlag,
  setUserAccountStatus,
  touchLastSeen,
} from "@/lib/admin-repository";

/**
 * Integración contra PostgreSQL real. Se omite si no hay DATABASE_URL, de modo
 * que la suite sigue pasando en un entorno sin base de datos.
 */
const enabled = isDatabaseConfigured();
const suite = enabled ? describe : describe.skip;
const ADMIN = "aresiaagency@gmail.com";

let ownerId = "";
let memberId = "";
let workspaceId = "";
let projectId = "";
let queryId = "";

suite("panel de administración contra la base de datos", () => {
  beforeAll(async () => {
    const sql = db();
    const [owner] = await sql<[{ id: string }]>`
      insert into users (oauth_subject, email, full_name)
      values ('test-owner', 'owner@example.test', 'Titular de prueba')
      on conflict (oauth_subject) do update set email = excluded.email
      returning id
    `;
    ownerId = owner.id;

    const [member] = await sql<[{ id: string }]>`
      insert into users (oauth_subject, email, full_name, account_status)
      values ('test-member', 'member@example.test', 'Miembro de prueba', 'PENDING')
      on conflict (oauth_subject) do update set email = excluded.email
      returning id
    `;
    memberId = member.id;

    const [workspace] = await sql<[{ id: string }]>`
      insert into workspaces (name, created_by) values ('Espacio de prueba', ${ownerId}) returning id
    `;
    workspaceId = workspace.id;

    await sql`
      insert into workspace_members (workspace_id, user_id, role, created_by)
      values (${workspaceId}, ${ownerId}, 'OWNER', ${ownerId})
    `;

    const [project] = await sql<[{ id: string }]>`
      insert into business_projects (workspace_id, name, business_description, created_by)
      values (${workspaceId}, 'Proyecto de prueba', 'Desarrollo de software', ${ownerId})
      returning id
    `;
    projectId = project.id;

    await sql`
      insert into formation_cases (workspace_id, project_id, created_by)
      values (${workspaceId}, ${projectId}, ${ownerId})
    `;

    await sql`
      insert into data_ingestion_events (
        workspace_id, user_id, project_id, channel, input_type, raw_text, normalized_text,
        extracted_data, status, requires_confirmation, created_by
      ) values (
        ${workspaceId}, ${ownerId}, ${projectId}, 'WHATSAPP', 'TEXT',
        'Soy yo solo y quiero montar una SL', 'Soy yo solo y quiero montar una SL',
        ${sql.json([{ field: "number_of_founders", value: 1 }])}, 'NEEDS_CONFIRMATION', true, ${ownerId}
      )
    `;

    const [query] = await sql<[{ id: string }]>`
      insert into official_queries (workspace_id, project_id, question, statement_authority, status, created_by)
      values (${workspaceId}, ${projectId}, '¿Qué modelo censal presento?', 'OFFICIAL_SOURCE', 'ANSWERED', ${ownerId})
      returning id
    `;
    queryId = query.id;
  });

  afterAll(async () => {
    const sql = db();
    await sql`delete from workspaces where id = ${workspaceId}`;
    await sql`delete from users where id in (${ownerId}, ${memberId})`;
    await sql`delete from admin_audit_events where actor_email = ${ADMIN}`;
    await sql.end({ timeout: 5 });
  });

  it("las cifras de plataforma cuentan lo que existe", async () => {
    const totals = await readPlatformTotals();
    expect(totals.users).toBeGreaterThanOrEqual(2);
    expect(totals.workspaces).toBeGreaterThanOrEqual(1);
    expect(totals.projects).toBeGreaterThanOrEqual(1);
    expect(totals.pendingConfirmations).toBeGreaterThanOrEqual(1);
  });

  it("el listado de usuarios trae estado, espacios y expedientes", async () => {
    const users = await listUsers();
    const owner = users.find((user) => user.id === ownerId);
    expect(owner?.account_status).toBe("ACTIVE");
    expect(owner?.workspaces).toBe(1);
    expect(owner?.projects).toBe(1);
    expect(owner?.whatsapp_linked).toBe(false);
    expect(users.find((user) => user.id === memberId)?.account_status).toBe("PENDING");
  });

  it("aceptar y suspender cambia el estado y deja rastro", async () => {
    await setUserAccountStatus({ userId: memberId, status: "ACTIVE", actorEmail: ADMIN });
    let users = await listUsers();
    expect(users.find((user) => user.id === memberId)?.account_status).toBe("ACTIVE");

    await setUserAccountStatus({
      userId: memberId, status: "SUSPENDED", reason: "Revisión de identidad", actorEmail: ADMIN,
    });
    users = await listUsers();
    const suspended = users.find((user) => user.id === memberId);
    expect(suspended?.account_status).toBe("SUSPENDED");
    expect(suspended?.suspended_reason).toBe("Revisión de identidad");

    const trail = await readAdminAuditTrail();
    expect(trail.some((entry) => entry.action === "USER_SUSPENDED")).toBe(true);
    expect(trail.some((entry) => entry.action === "USER_ACTIVE")).toBe(true);
  });

  it("no permite borrar a quien creó espacios de trabajo", async () => {
    await expect(deleteUser({ userId: ownerId, actorEmail: ADMIN })).rejects.toThrow("USER_OWNS_WORKSPACES");
  });

  it("borra una cuenta sin espacios y lo registra", async () => {
    await deleteUser({ userId: memberId, actorEmail: ADMIN });
    const users = await listUsers();
    expect(users.find((user) => user.id === memberId)).toBeUndefined();
    const trail = await readAdminAuditTrail();
    expect(trail.some((entry) => entry.action === "USER_DELETED")).toBe(true);
  });

  it("espacios, expedientes e ingesta se listan con su contexto", async () => {
    const workspaces = await listWorkspaces();
    expect(workspaces.find((w) => w.id === workspaceId)?.projects).toBe(1);

    const projects = await listProjectsOverview();
    const project = projects.find((p) => p.id === projectId);
    expect(project?.case_stage).toBe("IDEA");
    expect(project?.review_state).toBe("AI_REVIEWED");
    expect(project?.pending_fields).toBe(1);

    const events = await listIngestionEvents();
    expect(events[0]?.channel).toBe("WHATSAPP");
    expect(events[0]?.requires_confirmation).toBe(true);
  });

  it("la valoración de calidad se guarda y queda auditada", async () => {
    await setQualityFlag({ queryId, flag: "OUTDATED_SOURCE", actorEmail: ADMIN });
    const queries = await listOfficialQueries();
    expect(queries.find((query) => query.id === queryId)?.quality_flag).toBe("OUTDATED_SOURCE");
    const trail = await readAdminAuditTrail();
    expect(trail.some((entry) => entry.action === "QUALITY_FLAGGED")).toBe(true);
  });

  it("la marca de actividad no falla con un correo desconocido", async () => {
    await expect(touchLastSeen("desconocido@example.test")).resolves.toBeUndefined();
  });
});
