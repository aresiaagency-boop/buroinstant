import { describe, expect, it } from "vitest";
import { deriveTasks, sourceKindFor, type ProjectProfile } from "@/lib/task-engine";
import { buildCompleteness } from "@/lib/completeness";
import { REGULATORY_FACTS, fact, isBindingFact } from "@/lib/regulatory-facts";

const company: Partial<ProjectProfile> = { legalForm: "SL", founders: 2 };

describe("motor de trámites", () => {
  it("NUNCA indica presentar el modelo 037; sólo puede decir que está suprimido", () => {
    const perfiles: Array<Partial<ProjectProfile>> = [
      { legalForm: "AUTONOMO" },
      { legalForm: "SLU" },
      { legalForm: "SL", willHireWorkers: true, hasPremises: true, publicConcurrence: true },
      { legalForm: "SL", revenueBand: "OVER_1M" },
      {},
    ];
    for (const perfil of perfiles) {
      const tasks = deriveTasks(perfil);
      for (const task of tasks) {
        expect(task.title).not.toMatch(/\b037\b/);
      }
      for (const fragment of JSON.stringify(tasks).split(". ")) {
        if (/\b037\b/.test(fragment)) expect(fragment).toMatch(/suprimid/i);
      }
      expect(JSON.stringify(tasks)).toMatch(/\b036\b/);
    }
  });

  it("el itinerario societario incluye notaría, registro y NIF; el de autónomo no", () => {
    const societario = deriveTasks(company).map((task) => task.code);
    const autonomo = deriveTasks({ legalForm: "AUTONOMO" }).map((task) => task.code);
    for (const code of ["COMPANY_NAME", "BYLAWS", "CAPITAL", "NOTARY", "REGISTRY", "NIF_DEFINITIVO", "BENEFICIAL_OWNERS"]) {
      expect(societario).toContain(code);
      expect(autonomo).not.toContain(code);
    }
  });

  it("por debajo de 1.000.000 € usa la vía de exención con 036, no el 840", () => {
    const tasks = deriveTasks({ ...company, revenueBand: "K60_250" });
    expect(tasks.some((task) => task.code === "IAE_EXENCION")).toBe(true);
    expect(tasks.some((task) => task.code === "IAE_840_848")).toBe(false);
  });

  it("por encima de 1.000.000 € aparecen los modelos 840 y 848", () => {
    const iae = deriveTasks({ ...company, revenueBand: "OVER_1M" }).find((task) => task.code === "IAE_840_848");
    expect(iae).toBeDefined();
    expect(iae?.detail).toMatch(/840/);
    expect(iae?.detail).toMatch(/848/);
  });

  it("la inscripción en Seguridad Social no nace lista: su fundamento no está verificado", () => {
    const task = deriveTasks({ ...company, willHireWorkers: true }).find((t) => t.code === "SS_INSCRIPCION");
    expect(task?.status).toBe("NOT_STARTED");
    expect(task?.pendingVerification?.length ?? 0).toBeGreaterThan(10);
  });

  it("sin local no genera licencia ni pública concurrencia", () => {
    const codes = deriveTasks(company).map((task) => task.code);
    expect(codes).not.toContain("LOCAL_LICENCIA");
    expect(codes).not.toContain("PUBLICA_CONCURRENCIA");
  });

  it("las operaciones intracomunitarias añaden ROI/VIES y las de fuera, EORI", () => {
    const codes = deriveTasks({ ...company, euOperations: true, nonEuOperations: true }).map((t) => t.code);
    expect(codes).toContain("ROI_VIES");
    expect(codes).toContain("EORI");
    expect(deriveTasks(company).map((t) => t.code)).not.toContain("ROI_VIES");
  });

  it("cada trámite explica cómo se acredita", () => {
    for (const task of deriveTasks({ ...company, hasPremises: true, willHireWorkers: true })) {
      expect(task.verificationMethod.length).toBeGreaterThan(5);
    }
  });

  it("las dependencias apuntan a trámites que existen", () => {
    const tasks = deriveTasks({ ...company, hasPremises: true, publicConcurrence: true, willHireWorkers: true });
    const codes = new Set(tasks.map((task) => task.code));
    for (const task of tasks) {
      for (const dependency of task.dependencyCodes) expect(codes).toContain(dependency);
    }
  });
});

describe("¿qué me falta?", () => {
  it("separa bloqueadores y no cuenta como hecho lo que no lo está", () => {
    const report = buildCompleteness(deriveTasks(company), [
      { field: "preferred_legal_form", label: "Forma jurídica", blocking: true },
    ]);
    expect(report.buckets.BLOQUEADOR.length).toBeGreaterThan(0);
    expect(report.percentComplete).toBe(0);
    expect(report.nextQuestion).toBeTruthy();
  });

  it("un trámite completado sube el progreso y desbloquea a los que dependían de él", () => {
    const tasks = deriveTasks(company).map((task) =>
      task.code === "IDENTITY" ? { ...task, status: "COMPLETED" as const } : task,
    );
    const report = buildCompleteness(tasks);
    expect(report.buckets.COMPLETADO).toHaveLength(1);
    expect(report.percentComplete).toBeGreaterThan(0);
  });

  it("devuelve una sola pregunta, no una batería", () => {
    const report = buildCompleteness(deriveTasks(company));
    expect(report.nextQuestion?.split("?").length).toBeLessThanOrEqual(2);
  });
});

describe("datos regulatorios", () => {
  it("todo hecho cita al menos una fuente oficial", () => {
    for (const item of REGULATORY_FACTS) {
      expect(item.sources.length).toBeGreaterThan(0);
      for (const source of item.sources) expect(source.url).toMatch(/^https:\/\//);
    }
  });

  it("sólo son vinculantes los hechos verificados de fuente oficial o de la ley", () => {
    for (const item of REGULATORY_FACTS) {
      if (isBindingFact(item)) {
        expect(["OFFICIAL_SOURCE", "LAW"]).toContain(item.authority);
        expect(item.requiresLiveVerification).toBe(false);
      } else {
        expect(item.verificationNote?.length ?? 0).toBeGreaterThan(10);
      }
    }
  });

  it("el hecho del 037 está fechado y prohíbe su uso", () => {
    const item = fact("MODELO_037_SUPRIMIDO");
    expect(item?.effectiveDate).toBe("2025-02-03");
    expect(isBindingFact(item)).toBe(true);
    expect(item?.productRule).toMatch(/Ninguna tarea/);
  });

  it("el capital de 1 € nunca se presenta como recomendación por defecto", () => {
    const item = fact("SL_CAPITAL_MINIMO");
    expect(item?.productRule).toMatch(/Nunca presentar 1 €/);
    expect(item?.statement).toMatch(/reserva legal/);
    expect(item?.statement).toMatch(/solidariamente/);
  });
});

describe("los cuatro trámites que la práctica exige", () => {
  const SLU = { legalForm: "SLU" as const, founders: 1, hasPremises: false };
  const codigos = (perfil: Parameters<typeof deriveTasks>[0]) => deriveTasks(perfil).map((t) => t.code);

  it("la cuenta bancaria existe y bloquea al capital", () => {
    // El certificado bancario se pedía sin que existiera el paso de abrir la
    // cuenta, que es justo donde se atasca el recorrido real.
    const tareas = deriveTasks(SLU);
    expect(tareas.map((t) => t.code)).toContain("BANCO_CUENTA");
    const capital = tareas.find((t) => t.code === "CAPITAL");
    expect(capital?.dependencyCodes).toContain("BANCO_CUENTA");
  });

  it("la domiciliación existe y bloquea a la notaría", () => {
    const tareas = deriveTasks(SLU);
    expect(tareas.map((t) => t.code)).toContain("DOMICILIO_SOCIAL");
    expect(tareas.find((t) => t.code === "NOTARY")?.dependencyCodes).toContain("DOMICILIO_SOCIAL");
  });

  it("la legalización de libros va después del Registro", () => {
    const libros = deriveTasks(SLU).find((t) => t.code === "LIBROS_LEGALIZACION");
    expect(libros?.dependencyCodes).toContain("REGISTRY");
  });

  it("en unipersonal, los libros mencionan el registro de socio único", () => {
    const uno = deriveTasks({ ...SLU, founders: 1 }).find((t) => t.code === "LIBROS_LEGALIZACION");
    expect(uno?.title).toContain("socio único");
    const varios = deriveTasks({ legalForm: "SL", founders: 3 }).find((t) => t.code === "LIBROS_LEGALIZACION");
    expect(varios?.title).not.toContain("socio único");
  });

  it("la primera factura es el último paso y no se puede adelantar", () => {
    const tareas = deriveTasks(SLU);
    const factura = tareas.find((t) => t.code === "PRIMERA_FACTURA");
    expect(factura).toBeDefined();
    // Es la de mayor prioridad numérica: cierra el itinerario.
    expect(Math.max(...tareas.map((t) => t.priority))).toBe(factura!.priority);
    expect(factura!.dependencyCodes).toContain("CENSAL_036");
    expect(factura!.dependencyCodes).toContain("NIF_DEFINITIVO");
    expect(factura!.requiredDocuments).toContain("INVOICE");
  });

  it("un autónomo también factura, pero sin NIF de sociedad", () => {
    const factura = deriveTasks({ legalForm: "AUTONOMO", founders: 1 }).find(
      (t) => t.code === "PRIMERA_FACTURA",
    );
    expect(factura?.dependencyCodes).toEqual(["CENSAL_036"]);
  });

  it("los trámites de sociedad no aparecen para un autónomo", () => {
    const deAutonomo = codigos({ legalForm: "AUTONOMO", founders: 1 });
    expect(deAutonomo).not.toContain("BANCO_CUENTA");
    expect(deAutonomo).not.toContain("DOMICILIO_SOCIAL");
    expect(deAutonomo).not.toContain("LIBROS_LEGALIZACION");
  });

  it("ninguna dependencia apunta a un trámite que no existe en el itinerario", () => {
    for (const perfil of [SLU, { legalForm: "AUTONOMO" as const }, { legalForm: "SL" as const, founders: 2 }]) {
      const tareas = deriveTasks(perfil);
      const existentes = new Set(tareas.map((t) => t.code));
      for (const tarea of tareas) {
        for (const dep of tarea.dependencyCodes) {
          expect(existentes.has(dep), `${tarea.code} depende de ${dep}, que no está`).toBe(true);
        }
      }
    }
  });
});

/**
 * Hueco 7: había trámites sin enlace a fuente oficial, y la carpeta avisaba de
 * todos por igual. No todos podían tener enlace: abrir una cuenta en el banco no
 * es un procedimiento administrativo, y la licencia municipal depende de tu
 * ayuntamiento. Mezclarlos convertía la advertencia en ruido.
 */
describe("de dónde sale cada trámite", () => {
  const TODO_ACTIVO = {
    legalForm: "SLU" as const,
    founders: 1,
    hasPremises: true,
    publicConcurrence: true,
    willHireWorkers: true,
    euOperations: true,
    nonEuOperations: true,
    regulatedActivity: true,
  };

  it("todo trámite queda clasificado", () => {
    for (const tarea of deriveTasks(TODO_ACTIVO)) {
      expect(["OFICIAL", "SIN_ADMINISTRACION", "LOCAL"], tarea.code).toContain(tarea.sourceKind);
    }
  });

  it("todo trámite OFICIAL lleva su enlace, y es https a una sede pública", () => {
    const sinEnlace: string[] = [];
    for (const tarea of deriveTasks(TODO_ACTIVO)) {
      if (tarea.sourceKind !== "OFICIAL") continue;
      if (!tarea.sourceUrl) {
        sinEnlace.push(tarea.code);
        continue;
      }
      expect(tarea.sourceUrl, tarea.code).toMatch(/^https:\/\//);
      expect(new URL(tarea.sourceUrl).host, tarea.code).toMatch(/\.(gob\.es|boe\.es|rmc\.es)$/);
    }
    // Este es el hueco 7 en una línea: si algún día vuelve a haber un trámite
    // ante una administración sin decir dónde se presenta, esta lista lo nombra.
    expect(sinEnlace).toEqual([]);
  });

  it("un paso sin administración detrás no finge tener sede", () => {
    const banco = deriveTasks(TODO_ACTIVO).find((t) => t.code === "BANCO_CUENTA");
    expect(banco?.sourceKind).toBe("SIN_ADMINISTRACION");
    expect(banco?.sourceUrl).toBeUndefined();
  });

  it("la licencia municipal es local: no se enlaza el ayuntamiento de otro", () => {
    const licencia = deriveTasks(TODO_ACTIVO).find((t) => t.code === "LOCAL_LICENCIA");
    expect(licencia?.sourceKind).toBe("LOCAL");
    expect(licencia?.sourceUrl).toBeUndefined();
  });

  it("la denominación enlaza al Registro Mercantil Central", () => {
    const denominacion = deriveTasks(TODO_ACTIVO).find((t) => t.code === "COMPANY_NAME");
    expect(denominacion?.sourceUrl).toContain("rmc.es");
  });

  it("escritura, inscripción y estatutos citan la misma ley, que es la que los rige", () => {
    const tareas = deriveTasks(TODO_ACTIVO);
    for (const code of ["BYLAWS", "NOTARY", "REGISTRY"]) {
      expect(tareas.find((t) => t.code === code)?.sourceUrl, code).toContain("BOE-A-2010-10544");
    }
  });

  it("un trámite que el motor no clasifique se trata como oficial sin enlace", () => {
    // Es el caso que debe seguir avisando: nunca se degrada en silencio.
    expect(sourceKindFor("UN_TRAMITE_QUE_NO_EXISTE")).toBe("OFICIAL");
  });
});
