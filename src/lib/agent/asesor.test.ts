import { describe, expect, it } from "vitest";

import { describirContexto, leerRespuesta, limpiarPropuestas, type ContextoDelExpediente } from "@/lib/agent/asesor";
import { deriveTasks } from "@/lib/task-engine";
import { upcomingObligations } from "@/lib/obligations-calendar";

/**
 * Del asesor sólo se puede probar lo que no depende del modelo. Y es justo lo
 * que más importa: qué se le cuenta del expediente, y qué se deja pasar de lo
 * que conteste. Un modelo que alucina un campo no puede escribirlo.
 */

const CONTEXTO: ContextoDelExpediente = {
  profile: {
    business_description: "Software y agentes de IA",
    preferred_legal_form: "SLU",
    number_of_founders: 1,
    municipality: "Palma de Mallorca",
  },
  tareas: deriveTasks({ legalForm: "SLU", founders: 1, hasPremises: false }),
  obligaciones: upcomingObligations({ profile: { legalForm: "SLU" }, from: "2027-01-01", horizonDays: 200 }),
  documentos: [{ category: "IDENTITY", displayName: "DNI.pdf" }],
  denominaciones: [{ position: 1, name: "ARES AUTONOMOUS SYSTEMS SLU", status: "PROPOSED" }],
  hoy: "2027-01-15",
};

describe("lo que el asesor sabe del expediente", () => {
  const texto = describirContexto(CONTEXTO);

  it("lleva los datos respondidos y marca los que faltan", () => {
    expect(texto).toContain("Palma de Mallorca");
    // Lo no respondido se dice, no se omite: omitirlo invita a inventarlo.
    expect(texto).toContain("SIN RESPONDER");
  });

  it("lleva el estado real de cada trámite, no una lista genérica", () => {
    expect(texto).toContain("COMPANY_NAME");
    expect(texto).toMatch(/\[(NOT_STARTED|READY|WAITING_USER)\]/);
  });

  it("lleva los papeles que ya están y los vencimientos con fecha", () => {
    expect(texto).toContain("DNI.pdf");
    expect(texto).toContain("PRÓXIMOS VENCIMIENTOS");
  });

  it("sólo le pasa hechos verificados, y con su fuente", () => {
    expect(texto).toContain("HECHOS VERIFICADOS");
    // Un hecho pendiente de verificar no puede sostener una afirmación suya.
    expect(texto).not.toContain("CIRCE_DUE");
    expect(texto).toContain("https://");
  });

  it("le dice qué campos puede proponer y en qué formato", () => {
    expect(texto).toContain("preferred_legal_form");
    expect(texto).toContain("AAAA-MM-DD");
  });

  it("lleva las denominaciones pedidas al RMC", () => {
    expect(texto).toContain("ARES AUTONOMOUS SYSTEMS SLU");
  });
});

describe("lo que se deja pasar de lo que conteste", () => {
  it("un campo que no existe se descarta", () => {
    expect(limpiarPropuestas([{ field: "numero_de_la_suerte", value: 7, porque: "x" }])).toEqual([]);
  });

  it("un campo real pasa, con su motivo", () => {
    const limpias = limpiarPropuestas([
      { field: "municipality", value: "Palma", porque: "Lo has dicho en el mensaje" },
    ]);
    expect(limpias).toHaveLength(1);
    expect(limpias[0].field).toBe("municipality");
  });

  it("un valor vacío no es una propuesta", () => {
    expect(limpiarPropuestas([{ field: "municipality", value: "", porque: "x" }])).toEqual([]);
    expect(limpiarPropuestas([{ field: "municipality", value: null, porque: "x" }])).toEqual([]);
  });

  it("no se aceptan más de seis de golpe", () => {
    const muchas = Array.from({ length: 20 }, () => ({ field: "municipality", value: "Palma", porque: "x" }));
    expect(limpiarPropuestas(muchas)).toHaveLength(6);
  });

  it("lo que no sea una lista no rompe nada", () => {
    expect(limpiarPropuestas(null)).toEqual([]);
    expect(limpiarPropuestas("propuestas")).toEqual([]);
    expect(limpiarPropuestas([null, 3, "x"])).toEqual([]);
  });
});

describe("leer lo que devuelve el modelo", () => {
  it("lee el JSON pedido", () => {
    const leida = leerRespuesta('{"texto":"Te falta la certificación","propuestas":[],"comprobar":["el RMC"]}');
    expect(leida.texto).toBe("Te falta la certificación");
    expect(leida.comprobar).toEqual(["el RMC"]);
  });

  it("tolera que lo envuelva en vallas de código", () => {
    const leida = leerRespuesta('```json\n{"texto":"Hola","propuestas":[]}\n```');
    expect(leida.texto).toBe("Hola");
  });

  it("si no vino JSON, el texto sirve y no hay propuestas", () => {
    // El lado seguro del error: se pierde la propuesta, nunca se inventa una.
    const leida = leerRespuesta("Se me ha ido la pinza y he contestado en prosa.");
    expect(leida.texto).toContain("prosa");
    expect(leida.propuestas).toEqual([]);
  });
});
