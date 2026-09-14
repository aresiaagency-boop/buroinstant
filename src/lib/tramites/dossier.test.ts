import { describe, expect, it } from "vitest";

import { buildCarpeta, siguientePaso, type EntradaDeCarpeta } from "@/lib/tramites/dossier";
import { deriveTasks, type DerivedTask } from "@/lib/task-engine";

function tarea(parcial: Partial<DerivedTask> = {}): DerivedTask {
  return {
    code: "CENSAL",
    title: "Alta censal",
    detail: "Declaración censal de alta.",
    authority: "AEAT",
    status: "READY",
    priority: 100,
    dependencyCodes: [],
    requiredDocuments: ["TAX"],
    verificationMethod: "Justificante sellado.",
    sourceKind: "OFICIAL",
    sourceUrl: "https://sede.agenciatributaria.gob.es/",
    ...parcial,
  };
}

function entrada(parcial: Partial<EntradaDeCarpeta> = {}): EntradaDeCarpeta {
  const task = parcial.task ?? tarea();
  return {
    task,
    itinerario: parcial.itinerario ?? [task],
    profile: parcial.profile ?? {
      business_description: "Reparación de bicicletas",
      municipality: "Palma",
      preferred_legal_form: "SL",
    },
    documentos: parcial.documentos ?? [],
  };
}

describe("un dato que el expediente no tiene no se rellena", () => {
  it("el hueco se declara, con la pregunta que lo consigue", () => {
    const carpeta = buildCarpeta(entrada({ profile: { business_description: "Reparación de bicicletas" } }));
    const campos = carpeta.faltan.map((hueco) => hueco.campo);
    expect(campos).toContain("municipality");
    expect(campos).toContain("preferred_legal_form");
    expect(carpeta.faltan[0].comoSeConsigue.length).toBeGreaterThan(10);
  });

  it("ningún dato de la carpeta viene de fuera del expediente", () => {
    const carpeta = buildCarpeta(entrada({ profile: { municipality: "Palma" } }));
    for (const dato of carpeta.datos) {
      expect(dato.valor).toBe("Palma");
    }
  });

  it("«sin local» es una respuesta, no un hueco", () => {
    const carpeta = buildCarpeta(
      entrada({
        task: tarea({ code: "LOCAL_LICENCIA", requiredDocuments: [] }),
        profile: { municipality: "Palma", physical_premises: false, business_description: "Bicicletas" },
      }),
    );
    expect(carpeta.faltan).toHaveLength(0);
    expect(carpeta.datos.map((d) => d.valor)).toContain("Sin local abierto al público");
  });
});

describe("los papeles salen del archivo, no de una lista inventada", () => {
  it("separa lo aportado de lo que falta", () => {
    const carpeta = buildCarpeta(
      entrada({
        task: tarea({ requiredDocuments: ["TAX", "IDENTITY"] }),
        documentos: [{ id: "doc-1", category: "TAX", displayName: "modelo036.pdf" }],
      }),
    );
    expect(carpeta.papelesAportados).toHaveLength(1);
    expect(carpeta.papelesAportados[0].documentId).toBe("doc-1");
    expect(carpeta.papelesQueFaltan.map((p) => p.category)).toEqual(["IDENTITY"]);
  });

  it("la carpeta no pide ningún documento que el motor de trámites no pida", () => {
    const task = tarea({ requiredDocuments: [] });
    const carpeta = buildCarpeta(entrada({ task }));
    expect(carpeta.papelesQueFaltan).toHaveLength(0);
    expect(carpeta.papelesAportados).toHaveLength(0);
  });
});

describe("bloqueos", () => {
  const previo = tarea({ code: "NOTARY", title: "Escritura pública", requiredDocuments: [], status: "READY" });

  it("un trámite anterior sin cerrar bloquea", () => {
    const task = tarea({ dependencyCodes: ["NOTARY"] });
    const carpeta = buildCarpeta(entrada({ task, itinerario: [task, previo] }));
    expect(carpeta.bloqueadoPor.map((b) => b.code)).toEqual(["NOTARY"]);
    expect(carpeta.listoParaPresentar).toBe(false);
  });

  it("una dependencia que no está en el itinerario no bloquea: no aplica a este perfil", () => {
    const task = tarea({ dependencyCodes: ["NOTARY"] });
    const carpeta = buildCarpeta(entrada({ task, itinerario: [task] }));
    expect(carpeta.bloqueadoPor).toHaveLength(0);
  });

  it("una dependencia completada deja de bloquear", () => {
    const task = tarea({ dependencyCodes: ["NOTARY"] });
    const hecho = { ...previo, status: "COMPLETED" as const };
    const carpeta = buildCarpeta(entrada({ task, itinerario: [task, hecho] }));
    expect(carpeta.bloqueadoPor).toHaveLength(0);
  });
});

describe("la carpeta nunca afirma más de lo que sabe", () => {
  it("sin fuente oficial lo dice en voz alta", () => {
    const carpeta = buildCarpeta(entrada({ task: tarea({ sourceUrl: undefined }) }));
    expect(carpeta.advertencias.join(" ")).toContain("fuente oficial");
  });

  it("un fundamento pendiente de verificar impide darla por lista", () => {
    const carpeta = buildCarpeta(
      entrada({
        task: tarea({ requiredDocuments: [], pendingVerification: "Comprobar el plazo vigente." }),
        profile: { business_description: "Bicicletas", municipality: "Palma", preferred_legal_form: "SL" },
      }),
    );
    expect(carpeta.listoParaPresentar).toBe(false);
    expect(carpeta.advertencias.join(" ")).toContain("Comprobar el plazo vigente.");
  });

  it("«listo para presentar» no es «presentado»: el estado del trámite no cambia", () => {
    const carpeta = buildCarpeta(
      entrada({
        task: tarea({ requiredDocuments: [] }),
        profile: { business_description: "Bicicletas", municipality: "Palma", preferred_legal_form: "SL" },
      }),
    );
    expect(carpeta.listoParaPresentar).toBe(true);
    expect(carpeta.estado).toBe("READY");
  });
});

describe("el siguiente paso se dice en una línea", () => {
  it("primero lo que bloquea", () => {
    const task = tarea({ dependencyCodes: ["NOTARY"] });
    const previoAbierto = tarea({ code: "NOTARY", title: "Escritura pública", status: "READY" });
    const carpeta = buildCarpeta(entrada({ task, itinerario: [task, previoAbierto], profile: {} }));
    expect(siguientePaso(carpeta)).toContain("Escritura pública");
  });

  it("luego el dato que falta", () => {
    const carpeta = buildCarpeta(entrada({ profile: {} }));
    expect(siguientePaso(carpeta)).toContain("Falta un dato");
  });

  it("y por último el papel", () => {
    const carpeta = buildCarpeta(
      entrada({ profile: { business_description: "Bicicletas", municipality: "Palma", preferred_legal_form: "SL" } }),
    );
    expect(siguientePaso(carpeta)).toContain("archivo");
  });
});

describe("contra el itinerario real, no contra uno de mentira", () => {
  it("cada trámite derivado produce una carpeta coherente", () => {
    const itinerario = deriveTasks({ legalForm: "SL", founders: 2, hasPremises: true });
    expect(itinerario.length).toBeGreaterThan(5);
    for (const task of itinerario) {
      const carpeta = buildCarpeta({ task, itinerario, profile: {}, documentos: [] });
      expect(carpeta.code).toBe(task.code);
      // Sin ningún dato respondido, ninguna carpeta puede estar lista.
      expect(carpeta.listoParaPresentar).toBe(false);
      expect(siguientePaso(carpeta)).not.toBe("");
    }
  });
});

/**
 * La advertencia de fuente sólo sirve si no sale en todas partes. Antes saltaba
 * siempre que faltaba la URL, incluida la de abrir una cuenta en el banco.
 */
describe("la advertencia de fuente distingue de qué tipo de paso se trata", () => {
  it("un paso sin administración detrás lo dice, y no suena a fallo", () => {
    const carpeta = buildCarpeta(
      entrada({ task: tarea({ code: "BANCO_CUENTA", sourceKind: "SIN_ADMINISTRACION", sourceUrl: undefined }) }),
    );
    expect(carpeta.advertencias.join(" ")).toContain("no se presenta ante ninguna administración");
    expect(carpeta.advertencias.join(" ")).not.toContain("no lleva enlace a fuente oficial");
  });

  it("un trámite local remite a tu administración competente, con su nombre", () => {
    const carpeta = buildCarpeta(
      entrada({
        task: tarea({
          code: "LOCAL_LICENCIA",
          sourceKind: "LOCAL",
          authority: "Ayuntamiento competente",
          sourceUrl: undefined,
        }),
      }),
    );
    const texto = carpeta.advertencias.join(" ");
    expect(texto).toContain("Ayuntamiento competente");
    expect(texto).toContain("sede electrónica");
  });

  it("un trámite oficial sin enlace sí sigue avisando: ése es el caso de verdad", () => {
    const carpeta = buildCarpeta(entrada({ task: tarea({ sourceKind: "OFICIAL", sourceUrl: undefined }) }));
    expect(carpeta.advertencias.join(" ")).toContain("no lleva enlace a fuente oficial");
  });

  it("un trámite oficial con enlace no genera ninguna advertencia de fuente", () => {
    const carpeta = buildCarpeta(entrada({ task: tarea({ sourceKind: "OFICIAL" }) }));
    expect(carpeta.advertencias.join(" ")).not.toContain("fuente oficial");
    expect(carpeta.advertencias.join(" ")).not.toContain("ninguna administración");
  });

  it("ningún trámite real del itinerario avisa ya de que le falta la fuente", () => {
    const itinerario = deriveTasks({
      legalForm: "SLU",
      founders: 1,
      hasPremises: true,
      publicConcurrence: true,
      willHireWorkers: true,
      euOperations: true,
      nonEuOperations: true,
      regulatedActivity: true,
    });
    for (const task of itinerario) {
      const carpeta = buildCarpeta({ task, itinerario, profile: {}, documentos: [] });
      expect(carpeta.advertencias.join(" "), task.code).not.toContain("no lleva enlace a fuente oficial");
    }
  });
});
