import { beforeAll, describe, expect, it } from "vitest";

import { db, isDatabaseConfigured } from "@/lib/db";
import { saveProjectProfile } from "@/lib/project-profile";
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

const dueno: Actor = {
  mode: "oauth",
  userId: "reconcilia-dueno",
  email: "reconcilia@example.test",
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
