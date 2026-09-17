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

/**
 * Los identificadores de modelo caducan, y cuando caducan la API responde 404.
 *
 * Pasó en producción: el orbe contestaba «No he podido procesar esta entrada»
 * —el mensaje genérico de error del panel— y detrás había un `AI_HTTP_404` por
 * un nombre de modelo que esa cuenta no servía. Un fallo de configuración
 * disfrazado de fallo de red es un fallo que nadie arregla, porque nadie sabe
 * qué mirar.
 *
 * Se prueban en orden hasta que uno conteste. `ANTHROPIC_MODEL`, si está, va
 * primero: quien lo fija sabe lo que quiere.
 */
export const MODELOS_ANTHROPIC = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
];

export const MODELO_POR_DEFECTO = MODELOS_ANTHROPIC[0];

/** Temperatura alta para conversar; el rigor lo ponen las reglas, no el muestreo. */
export const TEMPERATURA = 0.7;

export type PropuestaDelAsesor = {
  field: ProfileKey;
  value: unknown;
  /** Por qué lo propone, en una línea, para que se pueda decidir sin releer todo. */
  porque: string;
};

/**
 * Lo que el asesor puede mover, no sólo comentar.
 *
 * Hasta aquí el orbe describía el expediente y proponía rellenar casillas. Un
 * gestor de verdad no hace eso: mueve el expediente. Estas son las dos únicas
 * cosas que puede pedir hacer, y las dos las confirma la persona con un botón.
 *
 * Deliberadamente NO existe una acción para subir un documento, firmar, pagar
 * ni presentar nada. Eso no se delega en un modelo.
 */
export type AccionDelAsesor =
  | {
      tipo: "MOVER_TRAMITE";
      code: string;
      /** El título del trámite, para que el botón se lea sin descifrar el código. */
      titulo: string;
      a: EstadoProponible;
      porque: string;
    }
  | { tipo: "PEDIR_DOCUMENTO"; code: string; titulo: string; documento: string; porque: string };

/**
 * Los estados que el asesor puede proponer.
 *
 * `NOT_APPLICABLE` no está: decidir que un trámite no le aplica a una empresa
 * es una decisión con consecuencia, y la toma la persona en el panel, no una
 * frase en un chat.
 */
export const ESTADOS_PROPONIBLES = ["IN_PROGRESS", "WAITING_AUTHORITY", "BLOCKED", "COMPLETED"] as const;
export type EstadoProponible = (typeof ESTADOS_PROPONIBLES)[number];

export type FuenteDelAsesor = {
  titulo: string;
  url: string;
};

export type RespuestaDelAsesor = {
  texto: string;
  propuestas: PropuestaDelAsesor[];
  /** Qué debería mirar la persona en la sede oficial antes de actuar. */
  comprobar: string[];
  /** Lo que propone hacer con el expediente, para confirmar con un botón. */
  acciones: AccionDelAsesor[];
  /** Enlaces para ir directo, nunca inventados: ver `filtrarFuentes`. */
  fuentes: FuenteDelAsesor[];
  modelo: string | null;
  proveedor: Proveedor;
  /** Si la respuesta se apoyó en una búsqueda en la web. */
  buscoEnLaWeb: boolean;
  /**
   * Si el proveedor aceptó siquiera la herramienta de búsqueda.
   *
   * No es lo mismo «no hacía falta buscar» que «esta cuenta no puede buscar».
   * Lo segundo cambia lo que el asesor puede prometer, y hay que poder verlo
   * sin leer un código de error.
   */
  busquedaDisponible: boolean;
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

/**
 * Lo que se deja pasar de lo que el asesor quiera mover.
 *
 * Mismo criterio que con las propuestas de datos, subido de nivel porque esto
 * ya no rellena una casilla: cambia el estado de un trámite.
 *
 *   · Un código que no es un trámite de ESTE expediente no existe.
 *   · Un estado fuera de la lista no existe.
 *   · COMPLETED sin un documento aportado A ESE trámite se cae entera. No se
 *     degrada a otro estado ni se convierte en una sugerencia: se cae. Es la
 *     prohibición §99 —no marcar un trámite como realizado sin evidencia— y no
 *     se delega en que el panel lo compruebe después.
 *   · Proponer el estado que ya tiene es ruido: un botón que no hace nada
 *     enseña a no pulsar los botones.
 */
export function limpiarAcciones(
  crudas: unknown,
  tareas: DerivedTask[],
  documentosPorTramite: Record<string, string[]>,
): AccionDelAsesor[] {
  if (!Array.isArray(crudas)) return [];

  const porCodigo = new Map(tareas.map((tarea) => [tarea.code, tarea]));
  const limpias: AccionDelAsesor[] = [];

  for (const cruda of crudas) {
    if (!cruda || typeof cruda !== "object") continue;
    const item = cruda as Record<string, unknown>;
    const code = String(item.code ?? "").trim().toUpperCase();
    const tarea = porCodigo.get(code);
    if (!tarea) continue;

    const porque = String(item.porque ?? "").trim().slice(0, 240);
    if (porque.length === 0) continue;

    if (item.tipo === "PEDIR_DOCUMENTO") {
      const documento = String(item.documento ?? "").trim().slice(0, 120);
      if (documento.length === 0) continue;
      limpias.push({ tipo: "PEDIR_DOCUMENTO", code, titulo: tarea.title, documento, porque });
      continue;
    }

    if (item.tipo !== "MOVER_TRAMITE") continue;

    const a = String(item.a ?? "").trim().toUpperCase();
    if (!(ESTADOS_PROPONIBLES as readonly string[]).includes(a)) continue;
    if (a === tarea.status) continue;
    if (a === "COMPLETED" && (documentosPorTramite[code] ?? []).length === 0) continue;

    limpias.push({ tipo: "MOVER_TRAMITE", code, titulo: tarea.title, a: a as EstadoProponible, porque });
  }

  // Cuatro es el límite por la misma razón que seis en las propuestas: una
  // pantalla de botones no se revisa, se pulsa a ciegas.
  return limpias.slice(0, 4);
}

export type ContextoDelExpediente = {
  profile: Partial<Record<ProfileKey, unknown>>;
  tareas: DerivedTask[];
  obligaciones: ObligationOccurrence[];
  documentos: Array<{ category: string; displayName: string }>;
  /**
   * Qué papel está aportado a qué trámite.
   *
   * La lista plana de documentos no servía para lo único que importa al
   * cerrarlos: un trámite se da por hecho cuando TIENE su papel, no cuando hay
   * papeles en el archivo. Sin esta relación el asesor proponía cerrar cosas
   * apoyándose en el documento de al lado.
   */
  documentosPorTramite: Record<string, string[]>;
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
    // El papel aportado va pegado a su trámite. Suelto en otra lista invitaba a
    // cerrar un trámite apoyándose en el documento del de al lado.
    const papeles = contexto.documentosPorTramite[tarea.code] ?? [];
    const prueba = papeles.length > 0 ? ` · PAPEL APORTADO: ${papeles.join(", ")}` : " · sin papel aportado";
    lineas.push(`· [${tarea.status}] ${tarea.code} — ${tarea.title} (${tarea.authority})${prueba}${fuente}`);
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

  lineas.push(
    "\nLO QUE PUEDES MOVER EN EL EXPEDIENTE (acciones, cada una la confirma la persona con un botón):" +
      "\n· MOVER_TRAMITE: cambiar el estado de un trámite del itinerario. Estados: " +
      ESTADOS_PROPONIBLES.join(", ") +
      ".\n· PEDIR_DOCUMENTO: pedir el papel concreto que falta para poder cerrar un trámite." +
      "\n\nCOMPLETED sólo lo puedes proponer para un trámite que ya tenga PAPEL APORTADO en el itinerario de arriba. " +
      "Si no lo tiene, lo que toca es PEDIR_DOCUMENTO, no darlo por hecho. " +
      "No propongas un estado que el trámite ya tiene. " +
      "No existe ninguna acción para firmar, pagar, presentar ni subir un documento: eso lo hace la persona.",
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
  "acciones": [{ "tipo": "MOVER_TRAMITE", "code": "<código del itinerario>", "a": "<estado>", "porque": "<una línea>" }],
  "fuentes": [{ "titulo": "<de qué es este enlace>", "url": "https://..." }]
}

"propuestas" va vacío salvo que la persona haya dicho un dato nuevo o haya corregido uno. Nunca propongas un valor que la persona no haya dicho: no adivines su municipio ni su forma jurídica.

"acciones" es cómo mueves el expediente de verdad, y es lo que te separa de un chat que sólo opina. Ponla cuando de la conversación se deduzca que un trámite ha cambiado de estado o que falta un papel concreto. La forma de PEDIR_DOCUMENTO es { "tipo": "PEDIR_DOCUMENTO", "code": "...", "documento": "<el papel, por su nombre>", "porque": "<una línea>" }. Va vacío si no hay nada que mover: proponer por proponer enseña a no mirar los botones.

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
  acciones: unknown;
  fuentes: unknown;
} {
  const limpio = bruto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const objeto = JSON.parse(limpio) as Record<string, unknown>;
    return {
      texto: String(objeto.texto ?? "").trim(),
      propuestas: objeto.propuestas,
      comprobar: objeto.comprobar,
      acciones: objeto.acciones,
      fuentes: objeto.fuentes,
    };
  } catch {
    // Si no vino JSON, el texto sigue sirviendo: se devuelve tal cual y sin
    // propuestas ni fuentes, que es el lado seguro del error.
    return { texto: limpio, propuestas: [], comprobar: [], acciones: [], fuentes: [] };
  }
}

/**
 * El otro 400 que se puede provocar sin enterarse.
 *
 * La API exige que la conversación empiece por la persona y alterne. El
 * historial que manda el panel no siempre cumple: si el orbe saludó primero,
 * el primer turno es del asistente y la petición entera se rechaza —otro 400
 * indistinguible del anterior, y otra tarde perdida.
 *
 * Se arregla aquí, que es donde se sabe: fuera los turnos vacíos, fuera los
 * del asistente que van por delante del primero de la persona, y dos seguidos
 * del mismo lado se juntan en uno.
 */
export function ordenarTurnos(turnos: Turno[]): Turno[] {
  const limpios = turnos.filter((turno) => turno.content.trim().length > 0);
  const primero = limpios.findIndex((turno) => turno.role === "user");
  if (primero < 0) return [];

  const ordenados: Turno[] = [];
  for (const turno of limpios.slice(primero)) {
    const anterior = ordenados[ordenados.length - 1];
    if (anterior && anterior.role === turno.role) {
      anterior.content = `${anterior.content}\n\n${turno.content}`;
      continue;
    }
    ordenados.push({ ...turno });
  }
  return ordenados;
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
  const turnos = ordenarTurnos([
    ...(input.historial ?? []).slice(-8).map((turno) => ({
      role: turno.rol === "user" ? ("user" as const) : ("assistant" as const),
      content: turno.texto,
    })),
    { role: "user" as const, content: input.texto },
  ]);

  const { bruto, modelo, buscoEnLaWeb, busquedaDisponible, urlsBuscadas } =
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
    acciones: limpiarAcciones(leida.acciones, input.contexto.tareas, input.contexto.documentosPorTramite),
    fuentes: filtrarFuentes(leida.fuentes, permitidas),
    modelo,
    proveedor: elegido.proveedor,
    buscoEnLaWeb,
    busquedaDisponible,
  };
}

type Turno = { role: "user" | "assistant"; content: string };
type Salida = {
  bruto: string;
  modelo: string;
  buscoEnLaWeb: boolean;
  busquedaDisponible: boolean;
  urlsBuscadas: string[];
};

/**
 * Anthropic, con búsqueda web.
 *
 * La búsqueda la hace el proveedor y devuelve las URLs que ha visitado de
 * verdad. Por eso se recogen aparte: una URL que salió de una búsqueda real se
 * puede citar; una que el modelo se saque de la cabeza, no.
 */
export function modelosAProbar(): string[] {
  const fijado = process.env.ANTHROPIC_MODEL?.trim();
  return fijado ? [fijado, ...MODELOS_ANTHROPIC.filter((m) => m !== fijado)] : [...MODELOS_ANTHROPIC];
}

/**
 * Lo que el proveedor dice que ha ido mal, sin arrastrar nada del expediente.
 *
 * Un 400 sin más es un callejón sin salida: dice que el cuerpo está mal pero no
 * qué campo. La API sí lo dice, en `error.message`, y esa línea es la
 * diferencia entre arreglarlo en un minuto o pasarse la tarde probando modelos.
 *
 * Se recorta y se limpia de saltos de línea porque va a terminar dentro de un
 * código de error. Nunca se devuelve el cuerpo enviado: ahí van los datos del
 * expediente.
 */
/**
 * Lo que hay que hacer, dicho en una línea.
 *
 * El mensaje que devuelve la API es correcto y es inútil para quien no vive
 * dentro de esa API: «This API key is not scoped to a workspace» no le dice a
 * nadie dónde pulsar. Un diagnóstico que no termina en una acción concreta es
 * media herramienta.
 *
 * Se traduce sólo lo que se ha visto fallar de verdad. Inventar traducciones
 * para errores hipotéticos envejece mal.
 */
export function queHacerConEsto(mensaje: string): string | null {
  const texto = mensaje.toLowerCase();

  if (texto.includes("anthropic-workspace-id") || texto.includes("not scoped to a workspace")) {
    return (
      "La clave de Anthropic es de organización y no está adscrita a ningún workspace. " +
      "Dos salidas: crear la clave DENTRO de un workspace en la consola de Anthropic y sustituirla " +
      "(no necesita nada más), o añadir la variable ANTHROPIC_WORKSPACE_ID con el id del workspace " +
      "(empieza por wrkspc_) y volver a desplegar."
    );
  }

  if (texto.includes("credit balance") || texto.includes("insufficient")) {
    return "La cuenta de Anthropic no tiene saldo. Recárgala en la consola y el asesor vuelve solo.";
  }

  if (texto.includes("authentication_error") || texto.includes("invalid x-api-key")) {
    return "La clave de Anthropic no es válida. Genera una nueva en la consola y actualízala en Vercel.";
  }

  if (texto.includes("rate_limit") || texto.includes("429")) {
    return "Has llegado al límite de peticiones de Anthropic. Espera unos minutos o sube el límite en la consola.";
  }

  if (texto.includes("not_found_error") || texto.includes("model:")) {
    return "Ese identificador de modelo no lo sirve esta cuenta. Fija uno válido en ANTHROPIC_MODEL.";
  }

  return null;
}

async function porQueSeQueja(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.clone().json()) as {
      error?: { type?: string; message?: string };
    };
    const tipo = cuerpo.error?.type ?? "";
    const mensaje = cuerpo.error?.message ?? "";
    const junto = [tipo, mensaje].filter((parte) => parte.length > 0).join(": ");
    return junto.replace(/\s+/g, " ").slice(0, 180);
  } catch {
    return "";
  }
}

/** Los bloques que se mandan cuando se quiere que el asesor busque en la web. */
function bloqueDeBusqueda() {
  return [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];
}

/**
 * Las cabeceras de la llamada, con el workspace si hace falta.
 *
 * Una clave de Anthropic creada a nivel de ORGANIZACIÓN no está adscrita a
 * ningún workspace, y entonces la API exige que cada petición diga a cuál
 * cargarla, con `anthropic-workspace-id`. Sin esa cabecera contesta 400 y la
 * llamada no llega a ningún modelo: por eso fallaban los cuatro, y por eso
 * fallaban también sin la herramienta de búsqueda.
 *
 * Una clave creada DENTRO de un workspace ya viene adscrita y no necesita
 * nada. Las dos formas valen; esto sostiene la primera.
 */
export function cabecerasAnthropic(clave: string): Record<string, string> {
  const cabeceras: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": clave,
    "anthropic-version": "2023-06-01",
  };
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  if (workspace) cabeceras["anthropic-workspace-id"] = workspace;
  return cabeceras;
}

async function llamarAnthropic(args: {
  clave: string;
  modelo: string;
  sistema: string;
  turnos: Turno[];
  conBusqueda: boolean;
  signal?: AbortSignal;
}): Promise<Response> {
  const cuerpo: Record<string, unknown> = {
    model: args.modelo,
    max_tokens: 2400,
    temperature: TEMPERATURA,
    system: args.sistema,
    messages: args.turnos,
  };
  if (args.conBusqueda) cuerpo.tools = bloqueDeBusqueda();

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: cabecerasAnthropic(args.clave),
    signal: args.signal,
    body: JSON.stringify(cuerpo),
  });
}

export async function porAnthropic(
  clave: string,
  sistema: string,
  turnos: Turno[],
  signal?: AbortSignal,
): Promise<Salida> {
  let respuesta: Response | null = null;
  let modelo = "";
  let conBusqueda = true;
  const fallos: string[] = [];

  for (const candidato of modelosAProbar()) {
    let intento = await llamarAnthropic({ clave, modelo: candidato, sistema, turnos, conBusqueda: true, signal });

    // El 400 que costó una tarde: los cuatro modelos devolvían 400 y el bucle
    // lo leía como «ese modelo no sirve», cuando lo que no servía era el
    // cuerpo. La herramienta de búsqueda del servidor no está habilitada en
    // todas las cuentas, y si no lo está tumba la petición entera.
    //
    // Antes de descartar el modelo se vuelve a preguntar sin ella. Se pierde la
    // búsqueda —y se dice, con `buscoEnLaWeb: false`—, pero el asesor contesta
    // con el expediente y los hechos verificados, que es su trabajo principal.
    if (!intento.ok && intento.status === 400) {
      const queja = await porQueSeQueja(intento);
      fallos.push(`${candidato}:400(${queja || "sin detalle"})`);
      intento = await llamarAnthropic({ clave, modelo: candidato, sistema, turnos, conBusqueda: false, signal });
      if (intento.ok) {
        respuesta = intento;
        modelo = candidato;
        conBusqueda = false;
        break;
      }
      fallos.push(`${candidato}:sin-busqueda:${intento.status}(${(await porQueSeQueja(intento)) || "sin detalle"})`);
      continue;
    }

    if (intento.ok) {
      respuesta = intento;
      modelo = candidato;
      break;
    }

    fallos.push(`${candidato}:${intento.status}(${(await porQueSeQueja(intento)) || "sin detalle"})`);
    // Un 404 es «ese modelo no», y toca probar el siguiente. Un 401 es la
    // clave, y un 429 la cuota: probar más modelos no arregla ninguno de los
    // dos y sólo gasta tiempo.
    if (intento.status !== 404) break;
  }

  if (!respuesta) throw new Error(`AI_HTTP_${fallos.join(" | ")}`);

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
    buscoEnLaWeb: conBusqueda && urlsBuscadas.length > 0,
    busquedaDisponible: conBusqueda,
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

  if (!respuesta.ok) {
    const queja = await porQueSeQueja(respuesta);
    throw new Error(`AI_HTTP_${modelo}:${respuesta.status}(${queja || "sin detalle"})`);
  }

  const cuerpo = (await respuesta.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return {
    bruto: cuerpo.choices?.[0]?.message?.content ?? "",
    modelo,
    buscoEnLaWeb: false,
    busquedaDisponible: false,
    urlsBuscadas: [],
  };
}

export { INFORMATIONAL_FOOTER };
