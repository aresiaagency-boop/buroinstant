import { beforeAll, describe, expect, it } from "vitest";

import { isDatabaseConfigured } from "@/lib/db";
import { saveProjectProfile } from "@/lib/project-profile";
import { EvidenceRequiredError, listTasks, syncTasks, updateTaskStatus } from "@/lib/task-repository";
import type { Actor } from "@/types/domain";

/**
 * Mover un trámite sin cerrarlo.
 *
 * El expediente sabía dar un trámite por hecho —con su papel delante— y no
 * sabía hacer nada más. Entre «no empezado» y «hecho» está el proceso entero:
 * la cita pedida, el escrito esperando respuesta, el paso atascado. Sin poder
 * anotarlo, el itinerario mentía y todo parecía parado.
 *
 * Estas pruebas van contra PostgreSQL porque lo que importa es que quede
 * escrito, y que la regla que impide cerrar sin evidencia siga en pie cuando se
 * abre esta segunda puerta.
 */
const enabled = isDatabaseConfigured();
const suite = enabled ? describe : describe.skip;

const RUN = Date.now();

const dueno: Actor = {
  mode: "oauth",
  userId: `estado-dueno-${RUN}`,
  email: `estado-${RUN}@example.test`,
  name: "Estado de trámites",
};

let projectId = "";
let codigo = "";

suite("un trámite se mueve por el itinerario", () => {
  beforeAll(async () => {
    const snapshot = await saveProjectProfile({
      actor: dueno,
      patch: {
        business_description: "Agentes de IA",
        preferred_legal_form: "SLU",
        number_of_founders: 1,
        municipality: "Palma de Mallorca",
      },
    });
    projectId = snapshot.id;
    const tareas = await syncTasks(dueno, projectId);
    codigo = tareas[0].code;
  });

  it("queda escrito que está en marcha", async () => {
    await updateTaskStatus({ actor: dueno, projectId, code: codigo, status: "IN_PROGRESS" });
    const tareas = await listTasks(dueno, projectId);
    expect(tareas.find((t) => t.code === codigo)?.status).toBe("IN_PROGRESS");
  });

  it("y que se espera a la administración, que no es lo mismo que estar parado", async () => {
    await updateTaskStatus({ actor: dueno, projectId, code: codigo, status: "WAITING_AUTHORITY" });
    const tareas = await listTasks(dueno, projectId);
    expect(tareas.find((t) => t.code === codigo)?.status).toBe("WAITING_AUTHORITY");
  });

  it("devuelve de dónde venía, para poder deshacerlo", async () => {
    const { previousStatus } = await updateTaskStatus({
      actor: dueno,
      projectId,
      code: codigo,
      status: "BLOCKED",
    });
    expect(previousStatus).toBe("WAITING_AUTHORITY");
  });

  /** La regla que no se relaja por abrir una puerta nueva. */
  it("NO se puede dar por hecho sin evidencia, tampoco por aquí", async () => {
    await expect(
      updateTaskStatus({ actor: dueno, projectId, code: codigo, status: "COMPLETED" }),
    ).rejects.toBeInstanceOf(EvidenceRequiredError);

    const tareas = await listTasks(dueno, projectId);
    expect(tareas.find((t) => t.code === codigo)?.status).toBe("BLOCKED");
  });

  it("un trámite de otro expediente no se mueve desde aquí", async () => {
    const intruso: Actor = {
      mode: "oauth",
      userId: `estado-intruso-${RUN}`,
      email: `estado-intruso-${RUN}@example.test`,
      name: "Intruso",
    };
    await expect(
      updateTaskStatus({ actor: intruso, projectId, code: codigo, status: "IN_PROGRESS" }),
    ).rejects.toThrow();
  });
});
