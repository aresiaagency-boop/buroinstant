import { PROFILE_KEYS, type ProfileKey } from "@/lib/project-profile";
import { INFORMATIONAL_FOOTER, REGULATORY_FACTS, isBindingFact } from "@/lib/regulatory-facts";
import type { ObligationOccurrence } from "@/lib/obligations-calendar";
import type { DerivedTask } from "@/lib/task-engine";

/**
 * El orbe, como asesor.
 *
 * Hasta aquí el orbe no llamaba a ningún modelo: era un extractor por reglas
 * que reconocía «soy una SL en Palma» y se quedaba mudo ante todo lo demás. Se
 * le pedía que gestionara y sólo sabía rellenar cinco casillas.
 *
 * Esto lo enchufa a un modelo, pero con el expediente delante: no contesta de
 * memoria sobre burocracia española, contesta sobre ESTE expediente, con sus
 * trámites, sus fechas y sus papeles. Y lo que propone cambiar sale como
 * propuesta con su riesgo, no como un cambio ya hecho.
 *
 * Cuatro reglas que no puede saltarse, y que van en el sistema y en el código:
 *
 *   1. **No inventa derecho.** Ni epígrafes, ni plazos, ni artículos. Lo que no
 *      esté en los hechos verificados que se le pasan, lo dice como lo que es:
 *      algo que hay que comprobar en la sede oficial.
 *   2. **No da nada por presentado.** Un trámite se cierra con un documento en
 *      el archivo, nunca porque alguien lo cuente en una conversación.
 *   3. **Un dato con consecuencia legal se propone, no se aplica.** La
 *      confirmación es de la persona. Esto ya regía en la ingesta de WhatsApp
 *      y aquí no cambia.
 *   4. **Sin clave de modelo no se inventa un asesor.** Se dice que el
 *      razonamiento no está disponible y se sigue con el extractor de reglas,
 *      que es peor pero es honesto.
 */

export const MODELO_POR_DEFECTO = "claude-sonnet-4-5";

/** Temperatura alta para conversar; el rigor lo ponen las reglas, no el muestreo. */
export const TEMPERATURA = 0.7;

export type PropuestaDelAsesor = {
  field: ProfileKey;
  value: unknown;
  /** Por qué lo propone, en una línea, para que se pueda decidir sin releer todo. */
  porque: string;
};

export type RespuestaDelAsesor = {
  texto: string;
  propuestas: PropuestaDelAsesor[];
  /** Qué debería mirar la persona en la sede oficial antes de actuar. */
  comprobar: string[];
  modelo: string | null;
};

export type ContextoDelExpediente = {
  profile: Partial<Record<ProfileKey, unknown>>;
  tareas: DerivedTask[];
  obligaciones: ObligationOccurrence[];
  documentos: Array<{ category: string; displayName: string }>;
  denominaciones: Array<{ position: number; name: string; status: string }>;
  hoy: string;
};

const PERSONA = `Eres el asesor burocrático de BUROINSTANT. Acompañas a una persona concreta a crear y mantener viva su empresa en España.

Cómo hablas:
· Directo. La primera frase responde; el contexto viene después si hace falta.
· Profesional y afilado: dices lo que hay que hacer y en qué orden, sin rodeos ni entusiasmo de folleto.
· En español de España, tuteando. Sin emoji. Sin "¡genial!", sin "espero que esto te ayude".
· Cuando algo va a costar dinero o puede salir mal, lo dices antes que nada.
· Si la persona se equivoca de premisa, se lo corriges de entrada en vez de seguirle la corriente.

Lo que NUNCA haces:
· Inventar un epígrafe de IAE, un plazo, un artículo o una obligación. Si no está en los HECHOS VERIFICADOS que te doy, dices que hay que comprobarlo en la sede oficial y por qué.
· Dar un trámite por presentado o concedido. Sólo un documento en el archivo cierra un trámite.
· Presentar tu respuesta como asesoramiento vinculante. No sustituyes a una notaría ni a un asesor fiscal.
· Aplicar por tu cuenta un cambio con consecuencia legal: lo propones y lo confirma la persona.`;

/** Lo que el expediente sabe, en texto, para que el modelo razone sobre esto y no sobre la nada. */
export function describirContexto(contexto: ContextoDelExpediente): string {
  const lineas: string[] = [];

  lineas.push(`FECHA DE HOY: ${contexto.hoy}`);

  lineas.push("\nEXPEDIENTE (lo que ya consta):");
  const etiquetas: Record<ProfileKey, string> = {
    business_description: "Actividad",
    preferred_legal_form: "Forma jurídica",
    number_of_founders: "Número de socios",
    municipality: "Municipio",
    physical_premises: "Local físico",
    activity_start_date: "Inicio de actividad (036)",
    accounts_approval_date: "Aprobación de cuentas por la junta",
    denomination_certified_at: "Certificación de denominación expedida el",
  };
  for (const clave of PROFILE_KEYS) {
    const valor = contexto.profile[clave];
    lineas.push(
      valor === undefined || valor === null || valor === ""
        ? `· ${etiquetas[clave]}: SIN RESPONDER`
        : `· ${etiquetas[clave]}: ${String(valor)}`,
    );
  }

  if (contexto.denominaciones.length > 0) {
    lineas.push("\nDENOMINACIONES PEDIDAS AL RMC:");
    for (const d of contexto.denominaciones) lineas.push(`· ${d.position}. ${d.name} — ${d.status}`);
  }

  lineas.push("\nITINERARIO (estado real de cada trámite):");
  for (const tarea of contexto.tareas) {
    const fuente = tarea.sourceUrl ? ` · fuente: ${tarea.sourceUrl}` : " · SIN FUENTE OFICIAL";
    lineas.push(`· [${tarea.status}] ${tarea.code} — ${tarea.title} (${tarea.authority})${fuente}`);
  }

  if (contexto.documentos.length > 0) {
    lineas.push("\nDOCUMENTOS EN EL ARCHIVO:");
    for (const doc of contexto.documentos) lineas.push(`· ${doc.category}: ${doc.displayName}`);
  } else {
    lineas.push("\nDOCUMENTOS EN EL ARCHIVO: ninguno todavía.");
  }

  const proximas = contexto.obligaciones.filter((o) => o.dueDate).slice(0, 12);
  if (proximas.length > 0) {
    lineas.push("\nPRÓXIMOS VENCIMIENTOS:");
    for (const o of proximas) {
      lineas.push(`· ${o.dueDate} — ${o.model ? `modelo ${o.model}, ` : ""}${o.title} (${o.periodLabel})`);
    }
  }

  lineas.push("\nHECHOS VERIFICADOS (lo único que puedes afirmar como normativa):");
  for (const hecho of REGULATORY_FACTS) {
    if (!isBindingFact(hecho)) continue;
    lineas.push(`· ${hecho.key}: ${hecho.statement} [${hecho.sources[0]?.url ?? "sin url"}]`);
  }

  lineas.push(
    "\nCAMPOS QUE PUEDES PROPONER CAMBIAR: " +
      PROFILE_KEYS.join(", ") +
      ". Las fechas van en formato AAAA-MM-DD. `preferred_legal_form` admite SL, SLU o AUTONOMO.",
  );

  return lineas.join("\n");
}

const FORMATO = `Responde SIEMPRE con un único objeto JSON, sin texto alrededor y sin vallas de código:

{
  "texto": "tu respuesta a la persona, en español, directa",
  "propuestas": [{ "field": "<uno de los campos permitidos>", "value": <valor>, "porque": "<una línea>" }],
  "comprobar": ["<lo que debe verificar en sede oficial antes de actuar, si procede>"]
}

"propuestas" va vacío salvo que la persona haya dicho un dato nuevo o haya corregido uno. Nunca propongas un valor que la persona no haya dicho: no adivines su municipio ni su forma jurídica.`;

export class SinProveedorError extends Error {
  constructor() {
    super("AI_PROVIDER_NOT_CONFIGURED");
    this.name = "SinProveedorError";
  }
}

export function proveedorConfigurado(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Se queda con los campos que existen; el modelo no puede inventarse una columna. */
export function limpiarPropuestas(crudas: unknown): PropuestaDelAsesor[] {
  if (!Array.isArray(crudas)) return [];
  const validas: PropuestaDelAsesor[] = [];
  for (const cruda of crudas) {
    if (!cruda || typeof cruda !== "object") continue;
    const item = cruda as Record<string, unknown>;
    const field = String(item.field ?? "") as ProfileKey;
    if (!PROFILE_KEYS.includes(field)) continue;
    if (item.value === undefined || item.value === null || item.value === "") continue;
    validas.push({
      field,
      value: item.value,
      porque: String(item.porque ?? "").slice(0, 300),
    });
  }
  return validas.slice(0, 6);
}

/** El JSON del modelo, tolerando que lo envuelva en vallas pese a lo pedido. */
export function leerRespuesta(bruto: string): { texto: string; propuestas: unknown; comprobar: unknown } {
  const limpio = bruto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const objeto = JSON.parse(limpio) as Record<string, unknown>;
    return {
      texto: String(objeto.texto ?? "").trim(),
      propuestas: objeto.propuestas,
      comprobar: objeto.comprobar,
    };
  } catch {
    // Si no vino JSON, el texto sigue sirviendo: se devuelve tal cual y sin
    // propuestas, que es el lado seguro del error.
    return { texto: limpio, propuestas: [], comprobar: [] };
  }
}

export async function consultarAsesor(input: {
  texto: string;
  contexto: ContextoDelExpediente;
  historial?: Array<{ rol: "user" | "assistant"; texto: string }>;
  signal?: AbortSignal;
}): Promise<RespuestaDelAsesor> {
  const clave = process.env.ANTHROPIC_API_KEY?.trim();
  if (!clave) throw new SinProveedorError();

  const modelo = process.env.ANTHROPIC_MODEL?.trim() || MODELO_POR_DEFECTO;
  const mensajes = [
    ...(input.historial ?? []).slice(-8).map((turno) => ({
      role: turno.rol === "user" ? ("user" as const) : ("assistant" as const),
      content: turno.texto,
    })),
    { role: "user" as const, content: input.texto },
  ];

  const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": clave,
      "anthropic-version": "2023-06-01",
    },
    signal: input.signal,
    body: JSON.stringify({
      model: modelo,
      max_tokens: 1600,
      temperature: TEMPERATURA,
      system: `${PERSONA}\n\n${describirContexto(input.contexto)}\n\n${FORMATO}`,
      messages: mensajes,
    }),
  });

  if (!respuesta.ok) {
    // El cuerpo de un error de la API puede traer datos de la petición: no se
    // registra ni se devuelve, sólo el código.
    throw new Error(`AI_HTTP_${respuesta.status}`);
  }

  const cuerpo = (await respuesta.json()) as { content?: Array<{ type: string; text?: string }> };
  const bruto = (cuerpo.content ?? [])
    .filter((bloque) => bloque.type === "text")
    .map((bloque) => bloque.text ?? "")
    .join("\n");

  const leida = leerRespuesta(bruto);
  return {
    texto: leida.texto || "No he podido componer una respuesta. Vuelve a preguntarlo con otras palabras.",
    propuestas: limpiarPropuestas(leida.propuestas),
    comprobar: Array.isArray(leida.comprobar)
      ? leida.comprobar.map((c) => String(c)).filter((c) => c.length > 0).slice(0, 5)
      : [],
    modelo,
  };
}

export { INFORMATIONAL_FOOTER };
