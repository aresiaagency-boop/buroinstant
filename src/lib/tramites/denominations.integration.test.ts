import { describe, expect, it } from "vitest";

import { isDatabaseConfigured } from "@/lib/db";
import { saveProjectProfile } from "@/lib/project-profile";
import { readCarpeta } from "@/lib/tramites/dossier-repository";
import {
  DuplicateDenominationError,
  TooManyGrantedError,
  readDenominations,
  saveDenominations,
} from "@/lib/tramites/denominations";
import type { Actor } from "@/types/domain";

/**
 * Las cinco denominaciones, guardadas en el expediente.
 *
 * Vivían en un documento aparte: se imprimía la carpeta del trámite, se llegaba
 * al Registro Mercantil Central y había que buscarlas en otro sitio. Estas
 * pruebas van contra PostgreSQL porque lo que se arregló es la persistencia.
 */
const enabled = isDatabaseConfigured();
const suite = enabled ? describe : describe.skip;

const RUN = Date.now();

const fundador: Actor = {
  mode: "oauth",
  userId: `denominaciones-${RUN}`,
  email: `denominaciones-${RUN}@example.test`,
  name: "Denominaciones",
};

let projectId = "";

suite("las denominaciones viven en el expediente", () => {
  it("se guardan por orden de preferencia", async () => {
    const snapshot = await saveProjectProfile({
      actor: fundador,
      patch: { business_description: "Software y agentes de IA", preferred_legal_form: "SLU" },
    });
    projectId = snapshot.id;

    const guardadas = await saveDenominations({
      actor: fundador,
      projectId,
      denominaciones: [
        { name: "ARES AUTONOMOUS REASONING AND EXECUTION SYSTEMS SLU" },
        { name: "ARES AUTONOMOUS SYSTEMS SLU" },
        { name: "ARES REASONING SYSTEMS SLU" },
      ],
    });

    expect(guardadas.map((d) => d.position)).toEqual([1, 2, 3]);
    expect(guardadas[0].status).toBe("PROPOSED");
  });

  it("se leen tal cual se escribieron, sin corregir el nombre", async () => {
    const leidas = await readDenominations(fundador, projectId);
    // Ni mayúsculas, ni puntos, ni forma social añadida: las reglas de
    // composición las aplica el RMC, y arreglarlas aquí pediría otro nombre.
    expect(leidas[0].name).toBe("ARES AUTONOMOUS REASONING AND EXECUTION SYSTEMS SLU");
  });

  it("reordenar es reponer la lista, y el orden nuevo manda", async () => {
    const guardadas = await saveDenominations({
      actor: fundador,
      projectId,
      denominaciones: [
        { name: "ARES AUTONOMOUS SYSTEMS SLU" },
        { name: "ARES AUTONOMOUS REASONING AND EXECUTION SYSTEMS SLU" },
      ],
    });
    expect(guardadas[0].name).toBe("ARES AUTONOMOUS SYSTEMS SLU");
    expect(await readDenominations(fundador, projectId)).toHaveLength(2);
  });

  it("dos nombres repetidos se rechazan, aunque cambie la caja", async () => {
    await expect(
      saveDenominations({
        actor: fundador,
        projectId,
        denominaciones: [{ name: "ARES SYSTEMS SLU" }, { name: "ares systems slu" }],
      }),
    ).rejects.toBeInstanceOf(DuplicateDenominationError);
  });

  it("dos concedidas a la vez no describen ninguna realidad", async () => {
    await expect(
      saveDenominations({
        actor: fundador,
        projectId,
        denominaciones: [
          { name: "UNA SLU", status: "GRANTED" },
          { name: "OTRA SLU", status: "GRANTED" },
        ],
      }),
    ).rejects.toBeInstanceOf(TooManyGrantedError);
  });
});

suite("la carpeta del trámite lleva las denominaciones", () => {
  it("sin ninguna propuesta, el trámite tiene un hueco y lo dice", async () => {
    await saveDenominations({ actor: fundador, projectId, denominaciones: [] });
    const carpeta = await readCarpeta({ actor: fundador, projectId, taskCode: "COMPANY_NAME" });

    expect(carpeta.faltan.map((h) => h.etiqueta)).toContain("Denominaciones a solicitar");
    expect(carpeta.listoParaPresentar).toBe(false);
  });

  it("con las cinco, la carpeta las imprime en orden", async () => {
    await saveDenominations({
      actor: fundador,
      projectId,
      denominaciones: [
        { name: "ARES AUTONOMOUS REASONING AND EXECUTION SYSTEMS SLU" },
        { name: "ARES AUTONOMOUS SYSTEMS SLU" },
        { name: "ARES REASONING SYSTEMS SLU" },
        { name: "AUTONOMOUS REASONING AND EXECUTION SYSTEMS SLU" },
        { name: "ARESIA AUTONOMOUS SYSTEMS SLU" },
      ],
    });
    const carpeta = await readCarpeta({ actor: fundador, projectId, taskCode: "COMPANY_NAME" });

    const bloque = carpeta.apartados.find((a) => a.titulo.startsWith("Denominaciones"));
    expect(bloque?.lineas).toHaveLength(5);
    expect(bloque?.lineas[0]).toContain("1. ARES AUTONOMOUS REASONING");
    expect(carpeta.faltan.map((h) => h.etiqueta)).not.toContain("Denominaciones a solicitar");
  });

  it("sin fecha de certificación, no se calcula ningún plazo y se dice", async () => {
    const carpeta = await readCarpeta({ actor: fundador, projectId, taskCode: "COMPANY_NAME" });
    const plazos = carpeta.apartados.find((a) => a.titulo.startsWith("Plazos"));
    expect(plazos?.lineas.join(" ")).toContain("no se puede calcular");
  });

  it("con la fecha, salen los dos plazos y el aviso de la presentación", async () => {
    await saveProjectProfile({
      actor: fundador,
      projectId,
      patch: { denomination_certified_at: "2026-05-22" },
    });
    const carpeta = await readCarpeta({ actor: fundador, projectId, taskCode: "COMPANY_NAME" });
    const plazos = carpeta.apartados.find((a) => a.titulo.startsWith("Plazos"));

    expect(plazos?.lineas.join(" ")).toContain("2026-08-22");
    expect(plazos?.lineas.join(" ")).toContain("2026-11-22");
    // El error que costó una inscripción: firmar en plazo pero presentar tarde.
    expect(plazos?.nota).toContain("PRESENTA");
  });

  it("otro trámite no arrastra el bloque de denominaciones", async () => {
    const carpeta = await readCarpeta({ actor: fundador, projectId, taskCode: "BYLAWS" });
    expect(carpeta.apartados).toHaveLength(0);
  });
});
