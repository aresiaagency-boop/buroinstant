import { beforeAll, describe, expect, it } from "vitest";

import { db, isDatabaseConfigured } from "@/lib/db";
import { upcomingObligations } from "@/lib/obligations-calendar";
import { readLatestProject, readProjectSnapshot, saveProjectProfile } from "@/lib/project-profile";
import { listTasks, reconcileTasks, syncTasks } from "@/lib/task-repository";
import type { Actor } from "@/types/domain";

/**
 * El itinerario tiene que seguir al perfil.
 *
 * Antes no lo hacía: `syncTasks` sólo corría la primera vez, así que corregir un
 * dato dejaba el itinerario congelado. Estas pruebas van contra PostgreSQL real
 * porque el fallo estaba justo en la persistencia, no en el motor.
 */
const enabled = isDatabaseConfigured();
const suite = enabled ? describe : describe.skip;

/**
 * Identidad distinta en cada ejecución.
 *
 * Antes no hacía falta: un cambio sin `projectId` abría expediente nuevo cada
 * vez, así que cada pasada empezaba limpia por accidente. Arreglado ese fallo
 * —ahora el cambio cae en el expediente que ya existe—, dos pasadas seguidas
 * contra la misma base compartían estado y la segunda fallaba. La prueba se
 * aísla ella, que es su trabajo, no el del producto.
 */
const RUN = Date.now();

const dueno: Actor = {
  mode: "oauth",
  userId: `reconcilia-dueno-${RUN}`,
  email: `reconcilia-${RUN}@example.test`,
  name: "Reconciliación",
};

let projectId = "";

suite("el itinerario se concilia cuando cambia el perfil", () => {
  beforeAll(async () => {
    const snapshot = await saveProjectProfile({
      actor: dueno,
      patch: {
        business_description: "Bar con terraza",
        preferred_legal_form: "SL",
        number_of_founders: 2,
        municipality: "Palma",
        physical_premises: true,
      },
    });
    projectId = snapshot.id;
    await syncTasks(dueno, projectId);
  });

  it("con local, la licencia de actividad está en el itinerario", async () => {
    const tareas = await listTasks(dueno, projectId);
    expect(tareas.map((t) => t.code)).toContain("LOCAL_LICENCIA");
  });

  it("al quitar el local, la licencia deja de aplicar", async () => {
    await saveProjectProfile({ actor: dueno, projectId, patch: { physical_premises: false } });
    const resultado = await reconcileTasks(dueno, projectId);
    expect(resultado.desactivados).toContain("LOCAL_LICENCIA");

    const tareas = await listTasks(dueno, projectId);
    const licencia = tareas.find((t) => t.code === "LOCAL_LICENCIA");
    // No desaparece: queda marcada como no aplicable, que es información.
    expect(licencia?.status).toBe("NOT_APPLICABLE");
  });

  it("si el local vuelve, la licencia se reactiva", async () => {
    await saveProjectProfile({ actor: dueno, projectId, patch: { physical_premises: true } });
    const resultado = await reconcileTasks(dueno, projectId);
    expect(resultado.reactivados).toContain("LOCAL_LICENCIA");

    const tareas = await listTasks(dueno, projectId);
    expect(tareas.find((t) => t.code === "LOCAL_LICENCIA")?.status).not.toBe("NOT_APPLICABLE");
  });

  it("reconciliar no pisa el progreso de un trámite en curso", async () => {
    const sql = db();
    await sql`
      update tasks set status = 'IN_PROGRESS'
      where project_id = ${projectId} and code = 'COMPANY_NAME'
    `;
    await reconcileTasks(dueno, projectId);
    const tareas = await listTasks(dueno, projectId);
    expect(tareas.find((t) => t.code === "COMPANY_NAME")?.status).toBe("IN_PROGRESS");
  });

  it("un trámite cerrado no se desactiva aunque deje de aplicar", async () => {
    const sql = db();
    await sql`
      update tasks set status = 'COMPLETED'
      where project_id = ${projectId} and code = 'LOCAL_LICENCIA'
    `;
    await saveProjectProfile({ actor: dueno, projectId, patch: { physical_premises: false } });
    const resultado = await reconcileTasks(dueno, projectId);

    // Manda la evidencia, no el perfil: si ya se cerró, se respeta.
    expect(resultado.desactivados).not.toContain("LOCAL_LICENCIA");
    expect(resultado.conservados).toContain("LOCAL_LICENCIA");
    const tareas = await listTasks(dueno, projectId);
    expect(tareas.find((t) => t.code === "LOCAL_LICENCIA")?.status).toBe("COMPLETED");
  });

  it("cambiar de sociedad a autónomo reescribe el itinerario entero", async () => {
    await saveProjectProfile({ actor: dueno, projectId, patch: { preferred_legal_form: "AUTONOMO" } });
    const resultado = await reconcileTasks(dueno, projectId);

    const tareas = await listTasks(dueno, projectId);
    const activas = tareas.filter((t) => t.status !== "NOT_APPLICABLE").map((t) => t.code);
    // Un autónomo no constituye sociedad: esos trámites dejan de aplicar.
    expect(activas).not.toContain("COMPANY_NAME");
    expect(activas).not.toContain("NOTARY");
    expect(resultado.desactivados.length).toBeGreaterThan(0);
  });
});

suite("la fecha de inicio de actividad se guarda y filtra el calendario", () => {
  it("se guarda y se lee tal cual", async () => {
    const snapshot = await saveProjectProfile({
      actor: dueno,
      projectId,
      patch: { activity_start_date: "2026-11-01" },
    });
    expect(snapshot.profile.activity_start_date).toBe("2026-11-01");
  });

  it("se puede borrar, y entonces el calendario vuelve a no filtrar", async () => {
    await saveProjectProfile({ actor: dueno, projectId, patch: { activity_start_date: null } });
    const snapshot = await readProjectSnapshot(dueno, projectId);
    expect(snapshot.profile.activity_start_date).toBeUndefined();
  });
});

/**
 * La fecha de aprobación de las cuentas por la junta. Sin ella, el depósito en
 * el Registro sólo puede mostrarse como límite legal exterior; con ella pasa a
 * ser el plazo de esta sociedad y el aviso se calcula sobre él.
 */
suite("la fecha de aprobación de las cuentas se guarda y fija el depósito", () => {
  it("se guarda y se lee tal cual", async () => {
    const snapshot = await saveProjectProfile({
      actor: dueno,
      projectId,
      patch: { preferred_legal_form: "SL", accounts_approval_date: "2027-03-15" },
    });
    expect(snapshot.profile.accounts_approval_date).toBe("2027-03-15");
  });

  it("guardada, el depósito deja de ser un límite y pasa a ser una fecha propia", async () => {
    const snapshot = await readProjectSnapshot(dueno, projectId);
    const cuentas = upcomingObligations({
      profile: { legalForm: "SL" },
      from: "2027-01-01",
      horizonDays: 300,
      accountsApproval: snapshot.profile.accounts_approval_date as string,
    }).find((o) => o.obligationCode === "CUENTAS_ANUALES");

    expect(cuentas?.dueDate).toBe("2027-04-15");
    expect(cuentas?.limitNote).toBeUndefined();
  });

  it("se puede borrar, y entonces vuelve el límite exterior", async () => {
    await saveProjectProfile({ actor: dueno, projectId, patch: { accounts_approval_date: null } });
    const snapshot = await readProjectSnapshot(dueno, projectId);
    expect(snapshot.profile.accounts_approval_date).toBeUndefined();
  });
});

/**
 * Un cambio sin `projectId` no puede abrir un expediente nuevo si ya hay uno.
 *
 * Pasó en producción, con el expediente real de A.R.E.S.: una llamada que sólo
 * reguardaba la forma jurídica creó un segundo expediente vacío que además pasó
 * a ser el más reciente, y el panel dejó de mostrar el verdadero.
 */
suite("un cambio sin expediente indicado va al que ya existe", () => {
  const solo: Actor = {
    mode: "oauth",
    userId: `expediente-unico-${RUN}`,
    email: `unico-${RUN}@example.test`,
    name: "Expediente único",
  };

  it("el primer dato abre expediente", async () => {
    const snapshot = await saveProjectProfile({
      actor: solo,
      patch: { business_description: "Panadería de barrio" },
    });
    expect(snapshot.id).toBeTruthy();
  });

  it("el segundo cambio, sin projectId, cae en el mismo expediente", async () => {
    const primero = await readLatestProject(solo);
    const segundo = await saveProjectProfile({ actor: solo, patch: { preferred_legal_form: "SL" } });
    expect(segundo.id).toBe(primero?.id);
  });

  it("y no queda un segundo expediente detrás", async () => {
    const sql = db();
    const filas = await sql<Array<{ count: string }>>`
      select count(*)::text as count
      from business_projects p
      join workspace_members m on m.workspace_id = p.workspace_id
      join users u on u.id = m.user_id
      where u.oauth_subject = ${solo.userId}
    `;
    expect(Number(filas[0].count)).toBe(1);
  });

  it("el expediente conserva lo que ya tenía", async () => {
    const actual = await readLatestProject(solo);
    expect(actual?.profile.business_description).toBe("Panadería de barrio");
    expect(actual?.profile.preferred_legal_form).toBe("SL");
  });
});
