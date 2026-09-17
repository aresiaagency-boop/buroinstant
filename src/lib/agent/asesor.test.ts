import { afterEach, describe, expect, it } from "vitest";

import {
  describirContexto,
  filtrarFuentes,
  leerRespuesta,
  limpiarAcciones,
  limpiarPropuestas,
  modelosAProbar,
  urlsDelContexto,
  type ContextoDelExpediente,
} from "@/lib/agent/asesor";
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
  documentosPorTramite: { IDENTITY: ["DNI.pdf"] },
  denominaciones: [{ position: 1, name: "ARES AUTONOMOUS SYSTEMS SLU", status: "PROPOSED" }],
  historial: [{ cuando: "2027-01-10 09:12", que: "DOCUMENT_UPLOADED" }],
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

/**
 * Los enlaces son la mitad del trabajo que el asesor viene a quitar. Y un
 * enlace inventado que parece oficial es peor que no dar ninguno: se pulsa.
 */
describe("los enlaces que devuelve", () => {
  const delContexto = new Set(["https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544"]);

  it("pasa un enlace que ya estaba en el contexto", () => {
    const fuentes = filtrarFuentes(
      [{ titulo: "Ley de Sociedades de Capital", url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544" }],
      delContexto,
    );
    expect(fuentes).toHaveLength(1);
  });

  it("pasa un dominio oficial aunque no estuviera en el contexto", () => {
    const fuentes = filtrarFuentes(
      [{ titulo: "Sede de la AEAT", url: "https://sede.agenciatributaria.gob.es/Sede/empresas.html" }],
      delContexto,
    );
    expect(fuentes).toHaveLength(1);
  });

  it("tumba un dominio que no es oficial ni venía dado", () => {
    const fuentes = filtrarFuentes(
      [{ titulo: "Guía definitiva", url: "https://blog-de-gestoria-cualquiera.com/como-crear-una-sl" }],
      delContexto,
    );
    expect(fuentes).toEqual([]);
  });

  it("tumba un dominio que sólo se parece a uno oficial", () => {
    // El caso que hay que parar: parece del BOE y no lo es.
    const fuentes = filtrarFuentes([{ titulo: "BOE", url: "https://boe.es.ejemplo-falso.com/x" }], delContexto);
    expect(fuentes).toEqual([]);
  });

  it("acepta un subdominio de uno oficial", () => {
    const fuentes = filtrarFuentes([{ titulo: "Palma", url: "https://www.palma.cat/tramites" }], delContexto);
    expect(fuentes).toHaveLength(1);
  });

  it("tumba lo que no sea https", () => {
    expect(filtrarFuentes([{ titulo: "x", url: "http://www.boe.es/algo" }], delContexto)).toEqual([]);
    expect(filtrarFuentes([{ titulo: "x", url: "javascript:alert(1)" }], delContexto)).toEqual([]);
  });

  it("no repite el mismo enlace dos veces", () => {
    const repe = [
      { titulo: "A", url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544" },
      { titulo: "B", url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544" },
    ];
    expect(filtrarFuentes(repe, delContexto)).toHaveLength(1);
  });
});

describe("el proveedor que haya", () => {
  it("las urls del contexto salen de los trámites y de los hechos verificados", () => {
    const urls = urlsDelContexto(CONTEXTO);
    expect(urls.size).toBeGreaterThan(5);
    for (const url of urls) expect(url.startsWith("https://")).toBe(true);
  });
});

describe("el seguimiento", () => {
  it("el asesor ve lo último que pasó en el expediente", () => {
    expect(describirContexto(CONTEXTO)).toContain("DOCUMENT_UPLOADED");
  });
});

/**
 * El fallo que costó una tarde: un identificador de modelo que esa cuenta no
 * servía, escondido tras «No he podido procesar esta entrada».
 */
describe("qué modelos se prueban", () => {
  const original = process.env.ANTHROPIC_MODEL;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = original;
  });

  it("prueba varios, no uno solo: los identificadores caducan", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(modelosAProbar().length).toBeGreaterThan(1);
  });

  it("el que fija la configuración va primero, y no se repite", () => {
    process.env.ANTHROPIC_MODEL = "claude-3-5-sonnet-latest";
    const lista = modelosAProbar();
    expect(lista[0]).toBe("claude-3-5-sonnet-latest");
    expect(lista.filter((m) => m === "claude-3-5-sonnet-latest")).toHaveLength(1);
  });

  it("uno desconocido también se respeta: quien lo fija sabe lo que quiere", () => {
    process.env.ANTHROPIC_MODEL = "un-modelo-que-solo-tiene-esta-cuenta";
    expect(modelosAProbar()[0]).toBe("un-modelo-que-solo-tiene-esta-cuenta");
  });
});

/**
 * El salto de opinar a mover.
 *
 * Un asesor que sólo describe el expediente no es un gestor, es un folleto. Lo
 * que lo convierte en gestor es poder mover un trámite. Y en el momento en que
 * puede moverlo, lo que importa es exactamente qué NO puede mover.
 */
describe("lo que el asesor puede mover del expediente", () => {
  const TAREAS = deriveTasks({ legalForm: "SLU", founders: 1, hasPremises: false });
  const CODIGO = TAREAS[0].code;
  const OTRO = TAREAS[1].code;

  it("mueve un trámite a un estado intermedio", () => {
    const acciones = limpiarAcciones(
      [{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "IN_PROGRESS", porque: "Has pedido la cita" }],
      TAREAS,
      {},
    );
    expect(acciones).toHaveLength(1);
    expect(acciones[0]).toMatchObject({ tipo: "MOVER_TRAMITE", code: CODIGO, a: "IN_PROGRESS" });
  });

  it("el botón lleva el título, no sólo el código", () => {
    const acciones = limpiarAcciones(
      [{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "BLOCKED", porque: "Falta el certificado" }],
      TAREAS,
      {},
    );
    expect(acciones[0].titulo).toBe(TAREAS[0].title);
  });

  /** La prohibición §99, y la razón de que esto se pruebe aquí y no en la interfaz. */
  it("NO puede dar por hecho un trámite sin papel aportado", () => {
    const acciones = limpiarAcciones(
      [{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "COMPLETED", porque: "Me dices que ya está" }],
      TAREAS,
      {},
    );
    expect(acciones).toEqual([]);
  });

  it("sí puede darlo por hecho cuando el papel está en ese trámite", () => {
    const acciones = limpiarAcciones(
      [{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "COMPLETED", porque: "Has subido la escritura" }],
      TAREAS,
      { [CODIGO]: ["escritura.pdf"] },
    );
    expect(acciones).toHaveLength(1);
  });

  it("el papel del trámite de al lado no vale", () => {
    const acciones = limpiarAcciones(
      [{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "COMPLETED", porque: "Hay documentos en el archivo" }],
      TAREAS,
      { [OTRO]: ["otra-cosa.pdf"] },
    );
    expect(acciones).toEqual([]);
  });

  it("un trámite que no es de este expediente no existe", () => {
    expect(
      limpiarAcciones([{ tipo: "MOVER_TRAMITE", code: "TRAMITE_INVENTADO", a: "IN_PROGRESS", porque: "x" }], TAREAS, {}),
    ).toEqual([]);
  });

  it("un estado que no está en la lista no pasa", () => {
    expect(
      limpiarAcciones([{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "PRESENTADO_Y_PAGADO", porque: "x" }], TAREAS, {}),
    ).toEqual([]);
  });

  it("decidir que un trámite no aplica no se delega en el modelo", () => {
    expect(
      limpiarAcciones([{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "NOT_APPLICABLE", porque: "x" }], TAREAS, {}),
    ).toEqual([]);
  });

  it("proponer el estado que ya tiene es ruido y se cae", () => {
    const actual = TAREAS[0].status;
    expect(limpiarAcciones([{ tipo: "MOVER_TRAMITE", code: CODIGO, a: actual, porque: "x" }], TAREAS, {})).toEqual([]);
  });

  it("una acción sin motivo no se pulsa a ciegas", () => {
    expect(
      limpiarAcciones([{ tipo: "MOVER_TRAMITE", code: CODIGO, a: "IN_PROGRESS", porque: "  " }], TAREAS, {}),
    ).toEqual([]);
  });

  it("pide el papel que falta, por su nombre", () => {
    const acciones = limpiarAcciones(
      [{ tipo: "PEDIR_DOCUMENTO", code: CODIGO, documento: "Certificación negativa del RMC", porque: "Sin ella no hay notaría" }],
      TAREAS,
      {},
    );
    expect(acciones).toHaveLength(1);
    expect(acciones[0]).toMatchObject({ tipo: "PEDIR_DOCUMENTO", documento: "Certificación negativa del RMC" });
  });

  it("pedir un documento sin decir cuál no pide nada", () => {
    expect(
      limpiarAcciones([{ tipo: "PEDIR_DOCUMENTO", code: CODIGO, documento: "", porque: "x" }], TAREAS, {}),
    ).toEqual([]);
  });

  it("no existe ninguna acción de firmar, pagar ni presentar", () => {
    expect(
      limpiarAcciones(
        [
          { tipo: "FIRMAR", code: CODIGO, porque: "x" },
          { tipo: "PAGAR_TASA", code: CODIGO, porque: "x" },
          { tipo: "PRESENTAR", code: CODIGO, porque: "x" },
        ],
        TAREAS,
        {},
      ),
    ).toEqual([]);
  });

  it("no acepta una pantalla entera de botones", () => {
    const muchas = TAREAS.slice(0, 10).map((t) => ({
      tipo: "MOVER_TRAMITE",
      code: t.code,
      a: t.status === "IN_PROGRESS" ? "BLOCKED" : "IN_PROGRESS",
      porque: "x",
    }));
    expect(limpiarAcciones(muchas, TAREAS, {}).length).toBeLessThanOrEqual(4);
  });

  it("lo que no sea una lista no rompe nada", () => {
    expect(limpiarAcciones(null, TAREAS, {})).toEqual([]);
    expect(limpiarAcciones("acciones", TAREAS, {})).toEqual([]);
    expect(limpiarAcciones([null, 7, "x"], TAREAS, {})).toEqual([]);
  });
});

describe("lo que el asesor ve del papeleo", () => {
  it("ve qué papel está aportado a qué trámite, no una lista suelta", () => {
    const tareas = deriveTasks({ legalForm: "SLU", founders: 1, hasPremises: false });
    const texto = describirContexto({
      ...CONTEXTO,
      tareas,
      documentosPorTramite: { [tareas[0].code]: ["escritura.pdf"] },
    });
    expect(texto).toContain("PAPEL APORTADO: escritura.pdf");
    expect(texto).toContain("sin papel aportado");
  });

  it("sabe que sin papel toca pedirlo, no darlo por hecho", () => {
    expect(describirContexto(CONTEXTO)).toContain("PEDIR_DOCUMENTO");
  });
});
