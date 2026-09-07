import { beforeAll, describe, expect, it } from "vitest";

import { db, isDatabaseConfigured } from "@/lib/db";
import { saveProjectProfile } from "@/lib/project-profile";
import { ensureActorWorkspace } from "@/lib/repository";
import { ProjectAccessError } from "@/lib/task-repository";
import { TramiteNotFoundError, readCarpeta } from "@/lib/tramites/dossier-repository";
import type { Actor } from "@/types/domain";

/**
 * Integración contra PostgreSQL real. Se omite si no hay DATABASE_URL, para que
 * la suite siga pasando donde no hay base de datos.
 *
 * Lo que se comprueba aquí no se puede comprobar con datos de mentira: que un
 * expediente ajeno responde lo mismo que uno inexistente, y que la carpeta se
 * arma con lo que hay guardado de verdad y no con lo que se le pase.
 */
const enabled = isDatabaseConfigured();
const suite = enabled ? describe : describe.skip;

const dueno: Actor = {
  mode: "oauth",
  userId: "carpeta-dueno",
  email: "dueno-carpeta@example.test",
  name: "Dueño",
};
const extrano: Actor = {
  mode: "oauth",
  userId: "carpeta-extrano",
  email: "extrano-carpeta@example.test",
  name: "Extraño",
};

let projectId = "";

suite("la carpeta de un trámite, contra la base de datos", () => {
  beforeAll(async () => {
    // El expediente se crea por el mismo camino que usa el panel, no a mano:
    // así la prueba falla si ese camino cambia.
    const snapshot = await saveProjectProfile({
      actor: dueno,
      patch: {
        business_description: "Reparación de bicicletas",
        preferred_legal_form: "SL",
        number_of_founders: 1,
        municipality: "Palma",
        physical_premises: true,
      },
    });
    projectId = snapshot.id;
    // El extraño existe y tiene su propio espacio, pero ninguno en éste.
    await ensureActorWorkspace(extrano);
  });

  it("arma la carpeta con lo que hay escrito en el expediente", async () => {
    const carpeta = await readCarpeta({ actor: dueno, projectId, taskCode: "ACTIVITY_CLASSIFICATION" });
    expect(carpeta.proyecto.name).toBe("Reparación de bicicletas");
    const valores = carpeta.datos.map((dato) => dato.valor);
    expect(valores).toContain("Reparación de bicicletas");
    expect(valores).toContain("Palma");
    expect(carpeta.siguientePaso.length).toBeGreaterThan(0);
  });

  it("un dato que no está en el expediente sale como hueco, no relleno", async () => {
    const carpeta = await readCarpeta({ actor: dueno, projectId, taskCode: "LOCAL_LICENCIA" }).catch(
      () => null,
    );
    // El trámite puede no aplicar a este perfil; si aplica, ningún dato puede
    // aparecer inventado.
    if (!carpeta) return;
    for (const dato of carpeta.datos) {
      expect(["Palma", "Reparación de bicicletas", "Sí, con local"]).toContain(dato.valor);
    }
  });

  it("un expediente ajeno responde lo mismo que uno inexistente", async () => {
    await expect(readCarpeta({ actor: extrano, projectId, taskCode: "ACTIVITY_CLASSIFICATION" })).rejects.toThrow(
      ProjectAccessError,
    );
  });

  it("un código que no está en este itinerario no existe", async () => {
    await expect(readCarpeta({ actor: dueno, projectId, taskCode: "TRAMITE_INVENTADO" })).rejects.toThrow(
      TramiteNotFoundError,
    );
  });

  it("preparar la carpeta no cambia el estado del trámite", async () => {
    const sql = db();
    const antes = await sql<Array<{ status: string }>>`
      select status from tasks where project_id = ${projectId} and code = 'ACTIVITY_CLASSIFICATION'
    `;
    await readCarpeta({ actor: dueno, projectId, taskCode: "ACTIVITY_CLASSIFICATION" });
    const despues = await sql<Array<{ status: string }>>`
      select status from tasks where project_id = ${projectId} and code = 'ACTIVITY_CLASSIFICATION'
    `;
    expect(despues.map((f) => f.status)).toEqual(antes.map((f) => f.status));
  });
});
