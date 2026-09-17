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

export type FuenteDelAsesor = {
  titulo: string;
  url: string;
};

export type RespuestaDelAsesor = {
  texto: string;
  propuestas: PropuestaDelAsesor[];
  /** Qué debería mirar la persona en la sede oficial antes de actuar. */
  comprobar: string[];
  /** Enlaces para ir directo, nunca inventados: ver `filtrarFuentes`. */
  fuentes: FuenteDelAsesor[];
  modelo: string | null;
  proveedor: Proveedor;
  /** Si la respuesta se apoyó en una búsqueda en la web. */
  buscoEnLaWeb: boolean;
};

export type Proveedor = "anthropic" | "openai" | "openrouter";

/**
 * Dominios cuyas URLs puede citar sin que nadie las haya verificado antes.
 *
 * Todo lo demás tiene que venir del contexto —las fuentes de los hechos
 * verificados y los `sourceUrl` de los trámites— o de una búsqueda real. Un
 * enlace inventado que parece oficial es peor que no dar enlace: se pulsa.
 */
const DOMINIOS_OFICIALES = [
  "boe.es",
  "agenciatributaria.gob.es",
  "seg-social.es",
  "seg-social.gob.es",
  "rmc.es",
  "registradores.org",
  "paeelectronico.es",
  "sede.administracion.gob.es",
  "administracion.gob.es",
  "palma.cat",
  "palma.es",
  "caib.es",
  "notariado.org",
  "europa.eu",
];

function esOficial(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DOMINIOS_OFICIALES.some((dominio) => host === dominio || host.endsWith(`.${dominio}`));
  } catch {
    return false;
  }
}

/**
 * Deja pasar sólo enlaces comprobables.
 *
 * Pasa una URL si estaba ya en el contexto que se le dio —así no puede
 * inventarse una fuente para una afirmación— o si es de un dominio oficial
 * español. Lo demás se cae, aunque el modelo insista.
 */
export function filtrarFuentes(crudas: unknown, urlsDelContexto: Set<string>): FuenteDelAsesor[] {
  if (!Array.isArray(crudas)) return [];
  const vistas = new Set<string>();
  const validas: FuenteDelAsesor[] = [];
  for (const cruda of crudas) {
    if (!cruda || typeof cruda !== "object") continue;
    const item = cruda as Record<string, unknown>;
    const url = String(item.url ?? "").trim();
    if (!url.startsWith("https://")) continue;
    if (!urlsDelContexto.has(url) && !esOficial(url)) continue;
    if (vistas.has(url)) continue;
    vistas.add(url);
    validas.push({ titulo: String(item.titulo ?? url).slice(0, 160), url });
  }
  return validas.slice(0, 8);
}

export type ContextoDelExpediente = {
  profile: Partial<Record<ProfileKey, unknown>>;
  tareas: DerivedTask[];
  obligaciones: ObligationOccurrence[];
  documentos: Array<{ category: string; displayName: string }>;
  denominaciones: Array<{ position: number; name: string; status: string }>;
  /** Lo último que pasó en el expediente, para poder dar seguimiento de verdad. */
  historial: Array<{ cuando: string; que: string }>;
  hoy: string;
};

const PERSONA = `Eres el asesor burocrático de BUROINSTANT. Acompañas a una persona concreta a crear y mantener viva su empresa en España, casi siempre en Palma de Mallorca y las Islas Baleares. Eres el mejor gestor que esa persona podría contratar: conoces el recorrido entero, sabes dónde se atasca la gente y te adelantas.

Tu trabajo es dejárselo fácil. Eso significa:
· Responder con el siguiente paso concreto, no con una explicación del sistema burocrático.
· Dar el enlace exacto donde se hace, cuando lo tengas. Un paso sin enlace obliga a buscarlo, y buscarlo es la mitad del trabajo que vienes a quitar.
· Decir qué documento hay que llevar, qué cuesta y cuánto suele tardar, cuando eso conste.
· Encadenar: después de contestar, decir qué se desbloquea y qué conviene empezar en paralelo. El cuello de botella casi nunca es el trámite que se está mirando.
· Dar seguimiento: si en el historial hay algo empezado y sin cerrar, sacarlo tú, aunque no te pregunten por ello.

Cómo hablas:
· Directo. La primera frase responde; el contexto viene después si hace falta.
· Profesional y afilado: qué hay que hacer y en qué orden, sin rodeos ni entusiasmo de folleto.
· En español de España, tuteando. Sin emoji. Sin "¡genial!", sin "espero que esto te ayude".
· Cuando algo va a costar dinero o puede salir mal, lo dices antes que nada.
· Si la persona se equivoca de premisa, se lo corriges de entrada en vez de seguirle la corriente.
· Breve. Si cabe en cinco líneas, no uses quince.

Lo que NUNCA haces:
· Inventar un epígrafe de IAE, un plazo, un artículo, una tasa o una obligación. Si no está en los HECHOS VERIFICADOS ni lo has encontrado buscando, dices que hay que comprobarlo en la sede oficial y por qué.
· Inventar un enlace. Sólo citas URLs que estén en el contexto o que hayas encontrado buscando. Si no tienes el enlace, dices dónde se llama esa gestión para que se busque por su nombre.
· Dar un trámite por presentado o concedido. Sólo un documento en el archivo cierra un trámite.
· Presentar tu respuesta como asesoramiento vinculante. No sustituyes a una notaría ni a un asesor fiscal, y lo dices cuando la pregunta roza ahí.
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

  if (contexto.historial.length > 0) {
    lineas.push("\nLO ÚLTIMO QUE PASÓ EN ESTE EXPEDIENTE (para dar seguimiento):");
    for (const evento of contexto.historial) lineas.push(`· ${evento.cuando} — ${evento.que}`);
  }

  lineas.push(
    "\nCAMPOS QUE PUEDES PROPONER CAMBIAR: " +
      PROFILE_KEYS.join(", ") +
      ". Las fechas van en formato AAAA-MM-DD. `preferred_legal_form` admite SL, SLU o AUTONOMO.",
  );

  return lineas.join("\n");
}

/** Las URLs que ya venían dadas. Una fuente fuera de aquí tiene que ser oficial. */
export function urlsDelContexto(contexto: ContextoDelExpediente): Set<string> {
  const urls = new Set<string>();
  for (const tarea of contexto.tareas) if (tarea.sourceUrl) urls.add(tarea.sourceUrl);
  for (const obligacion of contexto.obligaciones) if (obligacion.sourceUrl) urls.add(obligacion.sourceUrl);
  for (const hecho of REGULATORY_FACTS) {
    if (!isBindingFact(hecho)) continue;
    for (const fuente of hecho.sources) urls.add(fuente.url);
  }
  return urls;
}

const FORMATO = `Responde SIEMPRE con un único objeto JSON, sin texto alrededor y sin vallas de código:

{
  "texto": "tu respuesta a la persona, en español, directa",
  "propuestas": [{ "field": "<uno de los campos permitidos>", "value": <valor>, "porque": "<una línea>" }],
  "comprobar": ["<lo que debe verificar en sede oficial antes de actuar, si procede>"],
  "fuentes": [{ "titulo": "<de qué es este enlace>", "url": "https://..." }]
}

"propuestas" va vacío salvo que la persona haya dicho un dato nuevo o haya corregido uno. Nunca propongas un valor que la persona no haya dicho: no adivines su municipio ni su forma jurídica.

"fuentes" son los enlaces para ir directo a hacer la gestión o a leer la norma. Ponlos siempre que los tengas: es la mitad del trabajo que vienes a quitar. Sólo URLs del contexto o encontradas buscando; jamás una URL construida por ti.`;

export class SinProveedorError extends Error {
  constructor() {
    super("AI_PROVIDER_NOT_CONFIGURED");
    this.name = "SinProveedorError";
  }
}

/**
 * El proveedor que haya, no el que me apetezca.
 *
 * El orbe salía tonto en producción por esto: el asesor sólo hablaba Anthropic
 * y en Vercel estaba configurada la clave de OpenAI —la que usa la
 * transcripción de voz—. El panel decía «Proveedor de IA · OPERATIVO» porque
 * cuenta cualquiera de las tres, así que todo parecía bien y el orbe seguía
 * contestando por reglas.
 *
 * Anthropic primero porque es el único que trae búsqueda web integrada.
 */
export function elegirProveedor(): { proveedor: Proveedor; clave: string } | null {
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropic) return { proveedor: "anthropic", clave: anthropic };
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) return { proveedor: "openai", clave: openai };
  const openrouter = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouter) return { proveedor: "openrouter", clave: openrouter };
  return null;
}

export function proveedorConfigurado(): boolean {
  return elegirProveedor() !== null;
}

const MODELO_OPENAI = "gpt-4.1";
const MODELO_OPENROUTER = "anthropic/claude-sonnet-4.5";

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
export function leerRespuesta(bruto: string): {
  texto: string;
  propuestas: unknown;
  comprobar: unknown;
  fuentes: unknown;
} {
  const limpio = bruto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const objeto = JSON.parse(limpio) as Record<string, unknown>;
    return {
      texto: String(objeto.texto ?? "").trim(),
      propuestas: objeto.propuestas,
      comprobar: objeto.comprobar,
      fuentes: objeto.fuentes,
    };
  } catch {
    // Si no vino JSON, el texto sigue sirviendo: se devuelve tal cual y sin
    // propuestas ni fuentes, que es el lado seguro del error.
    return { texto: limpio, propuestas: [], comprobar: [], fuentes: [] };
  }
}

export async function consultarAsesor(input: {
  texto: string;
  contexto: ContextoDelExpediente;
  historial?: Array<{ rol: "user" | "assistant"; texto: string }>;
  signal?: AbortSignal;
}): Promise<RespuestaDelAsesor> {
  const elegido = elegirProveedor();
  if (!elegido) throw new SinProveedorError();

  const sistema = `${PERSONA}\n\n${describirContexto(input.contexto)}\n\n${FORMATO}`;
  const turnos = [
    ...(input.historial ?? []).slice(-8).map((turno) => ({
      role: turno.rol === "user" ? ("user" as const) : ("assistant" as const),
      content: turno.texto,
    })),
    { role: "user" as const, content: input.texto },
  ];

  const { bruto, modelo, buscoEnLaWeb, urlsBuscadas } =
    elegido.proveedor === "anthropic"
      ? await porAnthropic(elegido.clave, sistema, turnos, input.signal)
      : await porOpenAiCompatible(elegido, sistema, turnos, input.signal);

  const leida = leerRespuesta(bruto);
  // Lo que se encontró buscando cuenta como verificado: son URLs que el
  // buscador devolvió, no inventadas por el modelo.
  const permitidas = urlsDelContexto(input.contexto);
  for (const url of urlsBuscadas) permitidas.add(url);

  return {
    texto: leida.texto || "No he podido componer una respuesta. Vuelve a preguntarlo con otras palabras.",
    propuestas: limpiarPropuestas(leida.propuestas),
    comprobar: Array.isArray(leida.comprobar)
      ? leida.comprobar.map((c) => String(c)).filter((c) => c.length > 0).slice(0, 5)
      : [],
    fuentes: filtrarFuentes(leida.fuentes, permitidas),
    modelo,
    proveedor: elegido.proveedor,
    buscoEnLaWeb,
  };
}

type Turno = { role: "user" | "assistant"; content: string };
type Salida = { bruto: string; modelo: string; buscoEnLaWeb: boolean; urlsBuscadas: string[] };

/**
 * Anthropic, con búsqueda web.
 *
 * La búsqueda la hace el proveedor y devuelve las URLs que ha visitado de
 * verdad. Por eso se recogen aparte: una URL que salió de una búsqueda real se
 * puede citar; una que el modelo se saque de la cabeza, no.
 */
async function porAnthropic(
  clave: string,
  sistema: string,
  turnos: Turno[],
  signal?: AbortSignal,
): Promise<Salida> {
  const modelo = process.env.ANTHROPIC_MODEL?.trim() || MODELO_POR_DEFECTO;
  const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    signal,
    body: JSON.stringify({
      model: modelo,
      max_tokens: 2400,
      temperature: TEMPERATURA,
      system: sistema,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: turnos,
    }),
  });

  if (!respuesta.ok) throw new Error(`AI_HTTP_${respuesta.status}`);

  const cuerpo = (await respuesta.json()) as {
    content?: Array<{ type: string; text?: string; content?: Array<{ type?: string; url?: string }> }>;
  };
  const bloques = cuerpo.content ?? [];
  const urlsBuscadas: string[] = [];
  for (const bloque of bloques) {
    if (bloque.type !== "web_search_tool_result") continue;
    for (const resultado of bloque.content ?? []) {
      if (typeof resultado?.url === "string") urlsBuscadas.push(resultado.url);
    }
  }

  return {
    bruto: bloques.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n"),
    modelo,
    buscoEnLaWeb: urlsBuscadas.length > 0,
    urlsBuscadas,
  };
}

/**
 * OpenAI y OpenRouter, que hablan el mismo dialecto.
 *
 * Sin búsqueda web: aquí el asesor se apoya sólo en el expediente y en los
 * hechos verificados, y se le nota. Se dice en la respuesta en vez de
 * disimularlo.
 */
async function porOpenAiCompatible(
  elegido: { proveedor: Proveedor; clave: string },
  sistema: string,
  turnos: Turno[],
  signal?: AbortSignal,
): Promise<Salida> {
  const esOpenRouter = elegido.proveedor === "openrouter";
  const url = esOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const modelo = esOpenRouter
    ? process.env.OPENROUTER_MODEL?.trim() || MODELO_OPENROUTER
    : process.env.OPENAI_MODEL?.trim() || MODELO_OPENAI;

  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${elegido.clave}` },
    signal,
    body: JSON.stringify({
      model: modelo,
      temperature: TEMPERATURA,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sistema }, ...turnos],
    }),
  });

  if (!respuesta.ok) throw new Error(`AI_HTTP_${respuesta.status}`);

  const cuerpo = (await respuesta.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return {
    bruto: cuerpo.choices?.[0]?.message?.content ?? "",
    modelo,
    buscoEnLaWeb: false,
    urlsBuscadas: [],
  };
}

export { INFORMATIONAL_FOOTER };
