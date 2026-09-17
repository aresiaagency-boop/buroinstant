import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { porAnthropic } from "@/lib/agent/asesor";

/**
 * El fallo que tuvo el orbe mudo en producción.
 *
 * El diagnóstico decía `AI_HTTP_...:400,...:400,...:400,...:400`: los cuatro
 * modelos rechazados con el mismo código. Cuatro modelos distintos fallando
 * igual no son cuatro modelos malos, es un cuerpo malo —y lo era: el bloque de
 * búsqueda web del servidor, que esa cuenta no tenía habilitado, tumbaba la
 * petición entera. El bucle lo leía como «prueba el siguiente» y se los comía
 * todos sin arreglar nada.
 *
 * Lo que se prueba aquí es lo que faltaba: que ante un 400 se vuelva a
 * preguntar sin la herramienta antes de descartar el modelo, y que el motivo
 * que da la API llegue al diagnóstico en vez de perderse.
 */

const OK = {
  content: [{ type: "text", text: '{"texto":"listo","propuestas":[]}' }],
};

function respuesta(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TURNOS = [{ role: "user" as const, content: "¿qué me falta?" }];

let original: typeof globalThis.fetch;

beforeEach(() => {
  original = globalThis.fetch;
  process.env.ANTHROPIC_MODEL = "modelo-de-prueba";
});

afterEach(() => {
  globalThis.fetch = original;
  delete process.env.ANTHROPIC_MODEL;
  vi.restoreAllMocks();
});

function cuerpoDe(llamada: unknown): Record<string, unknown> {
  const init = llamada as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("cuando la cuenta no tiene búsqueda web habilitada", () => {
  it("repite sin la herramienta en vez de descartar el modelo", async () => {
    const llamadas: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      llamadas.push(init as RequestInit);
      const cuerpo = cuerpoDe(init);
      return cuerpo.tools
        ? respuesta(400, { error: { type: "invalid_request_error", message: "tools: unsupported tool type" } })
        : respuesta(200, OK);
    }) as unknown as typeof globalThis.fetch;

    const salida = await porAnthropic("clave", "sistema", TURNOS);

    expect(salida.modelo).toBe("modelo-de-prueba");
    expect(salida.bruto).toContain("listo");
    // Dos llamadas al MISMO modelo: con herramienta y sin ella. No dos modelos.
    expect(llamadas).toHaveLength(2);
    expect(cuerpoDe(llamadas[0]).model).toBe("modelo-de-prueba");
    expect(cuerpoDe(llamadas[1]).model).toBe("modelo-de-prueba");
    expect(cuerpoDe(llamadas[0]).tools).toBeDefined();
    expect(cuerpoDe(llamadas[1]).tools).toBeUndefined();
  });

  it("dice que no buscó, en vez de dejarlo entender", async () => {
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
      cuerpoDe(init).tools ? respuesta(400, { error: { message: "no" } }) : respuesta(200, OK),
    ) as unknown as typeof globalThis.fetch;

    const salida = await porAnthropic("clave", "sistema", TURNOS);
    expect(salida.buscoEnLaWeb).toBe(false);
  });
});

describe("cuando la búsqueda sí funciona", () => {
  it("no vuelve a preguntar ni pierde las urls visitadas", async () => {
    const llamadas: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      llamadas.push(init as RequestInit);
      return respuesta(200, {
        content: [
          { type: "web_search_tool_result", content: [{ url: "https://www.boe.es/algo" }] },
          { type: "text", text: '{"texto":"listo"}' },
        ],
      });
    }) as unknown as typeof globalThis.fetch;

    const salida = await porAnthropic("clave", "sistema", TURNOS);
    expect(llamadas).toHaveLength(1);
    expect(salida.buscoEnLaWeb).toBe(true);
    expect(salida.urlsBuscadas).toEqual(["https://www.boe.es/algo"]);
  });
});

describe("lo que cuenta cuando no hay forma", () => {
  it("lleva el motivo que da la API, no sólo el número", async () => {
    globalThis.fetch = vi.fn(async () =>
      respuesta(400, { error: { type: "invalid_request_error", message: "max_tokens: too large" } }),
    ) as unknown as typeof globalThis.fetch;

    await expect(porAnthropic("clave", "sistema", TURNOS)).rejects.toThrow(/max_tokens: too large/);
  });

  it("una clave mala no se disfraza de modelo malo: para en seco", async () => {
    const fetchMock = vi.fn(async () =>
      respuesta(401, { error: { type: "authentication_error", message: "invalid x-api-key" } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(porAnthropic("clave", "sistema", TURNOS)).rejects.toThrow(/authentication_error/);
    // Una sola llamada: probar los otros modelos no arregla una clave inválida.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un modelo que no existe sí deja probar el siguiente", async () => {
    delete process.env.ANTHROPIC_MODEL;
    const fetchMock = vi.fn(async () =>
      respuesta(404, { error: { type: "not_found_error", message: "model: unknown" } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(porAnthropic("clave", "sistema", TURNOS)).rejects.toThrow(/AI_HTTP_/);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("no devuelve nada de lo que se envió: el cuerpo lleva el expediente", async () => {
    globalThis.fetch = vi.fn(async () =>
      respuesta(400, { error: { message: "bad body" } }),
    ) as unknown as typeof globalThis.fetch;

    const fallo = await porAnthropic("clave-secreta-xyz", "El domicilio es Calle Falsa 1", TURNOS).catch(
      (error: Error) => error.message,
    );
    expect(fallo).not.toContain("clave-secreta-xyz");
    expect(fallo).not.toContain("Calle Falsa");
  });
});

/**
 * El 400 gemelo: la conversación mal formada.
 */
describe("el orden de los turnos", () => {
  it("no deja que la conversación empiece por el asistente", async () => {
    const { ordenarTurnos } = await import("@/lib/agent/asesor");
    const puestos = ordenarTurnos([
      { role: "assistant", content: "Hola, soy el orbe." },
      { role: "user", content: "¿qué me falta?" },
    ]);
    expect(puestos[0].role).toBe("user");
    expect(puestos).toHaveLength(1);
  });

  it("junta dos seguidos del mismo lado en vez de mandarlos sueltos", async () => {
    const { ordenarTurnos } = await import("@/lib/agent/asesor");
    const puestos = ordenarTurnos([
      { role: "user", content: "soy una SLU" },
      { role: "user", content: "en Palma" },
      { role: "assistant", content: "Anotado." },
    ]);
    expect(puestos).toHaveLength(2);
    expect(puestos[0].content).toContain("SLU");
    expect(puestos[0].content).toContain("Palma");
  });

  it("un turno vacío no viaja", async () => {
    const { ordenarTurnos } = await import("@/lib/agent/asesor");
    expect(ordenarTurnos([{ role: "user", content: "   " }])).toEqual([]);
  });
});
