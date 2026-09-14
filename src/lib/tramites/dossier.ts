import type { DerivedTask } from "@/lib/task-engine";
import { CATEGORY_LABEL, type DocumentCategory } from "@/lib/documents/validation";
import type { ProfileKey } from "@/lib/project-profile";

/**
 * La carpeta de presentación de un trámite.
 *
 * Hasta aquí el itinerario decía qué hay que hacer. Esto arma lo que hay que
 * llevar: los datos que el expediente ya tiene escritos con el nombre que usa
 * la administración, los papeles que ya están subidos, los que faltan, y qué
 * trámite anterior lo está bloqueando.
 *
 * Tres reglas gobiernan el resultado, y las tres son de omisión:
 *
 *   1. Un dato que el expediente no tiene **no se rellena**. Va a `faltan` con
 *      la pregunta que lo consigue. Rellenar un hueco con lo que parece
 *      probable es exactamente el error que hace que un trámite se devuelva.
 *   2. La carpeta **no añade requisitos legales**. Los documentos que pide son
 *      los que el motor de trámites ya deriva; el mapa de datos sólo dice
 *      cuáles de los datos que el expediente YA guarda hacen falta a mano.
 *   3. `listoParaPresentar` no significa presentado ni presentable: significa
 *      que no queda ningún hueco conocido. Nunca marca un trámite como hecho.
 */

export type DatoDeCarpeta = {
  campo: ProfileKey;
  etiqueta: string;
  valor: string;
};

export type HuecoDeCarpeta = {
  campo: ProfileKey;
  etiqueta: string;
  /** La pregunta concreta que rellena el hueco, en la lengua de quien la responde. */
  comoSeConsigue: string;
};

export type PapelDeCarpeta = {
  category: DocumentCategory;
  etiqueta: string;
  documentId?: string;
  nombre?: string;
};

export type Bloqueo = {
  code: string;
  title: string;
  estado: string;
};

export type Carpeta = {
  code: string;
  title: string;
  detail: string;
  authority: string;
  estado: string;
  /** La fuente oficial del trámite. Sin ella no se afirma dónde se presenta. */
  sourceUrl?: string;
  datos: DatoDeCarpeta[];
  faltan: HuecoDeCarpeta[];
  papelesAportados: PapelDeCarpeta[];
  papelesQueFaltan: PapelDeCarpeta[];
  bloqueadoPor: Bloqueo[];
  advertencias: string[];
  listoParaPresentar: boolean;
  verificacion: string;
};

/** Cómo se llama cada dato fuera del esquema, y qué pregunta lo consigue. */
const DATOS: Record<ProfileKey, { etiqueta: string; comoSeConsigue: string }> = {
  business_description: {
    etiqueta: "Actividad del negocio",
    comoSeConsigue: "Describe a qué se va a dedicar la empresa, en una frase.",
  },
  preferred_legal_form: {
    etiqueta: "Forma jurídica",
    comoSeConsigue: "Elige entre autónomo, SL o SLU en el expediente.",
  },
  number_of_founders: {
    etiqueta: "Número de socios",
    comoSeConsigue: "Indica cuántas personas constituyen el proyecto.",
  },
  municipality: {
    etiqueta: "Municipio",
    comoSeConsigue: "Indica el municipio donde va a estar la empresa.",
  },
  physical_premises: {
    etiqueta: "Local físico",
    comoSeConsigue: "Responde si vas a tener local abierto al público o no.",
  },
  activity_start_date: {
    etiqueta: "Fecha de inicio de actividad",
    comoSeConsigue: "La que declares en el modelo 036. Marca desde cuándo corren tus plazos.",
  },
  accounts_approval_date: {
    etiqueta: "Fecha de aprobación de las cuentas",
    comoSeConsigue:
      "El día en que la junta general aprobó las últimas cuentas anuales. Desde ella cuenta el mes para depositarlas.",
  },
};

/**
 * Qué datos —de los que el expediente ya guarda— hacen falta a mano en cada
 * trámite. Esto NO es una lista de requisitos legales: es un recordatorio de
 * qué hay que llevar escrito para no tener que buscarlo en el mostrador. Un
 * código que no esté aquí pide todos los datos conocidos, que es la respuesta
 * prudente cuando no se sabe.
 */
const DATOS_POR_TRAMITE: Record<string, ProfileKey[]> = {
  IDENTITY: ["number_of_founders"],
  ACTIVITY_CLASSIFICATION: ["business_description", "municipality"],
  COMPANY_NAME: ["preferred_legal_form"],
  BYLAWS: ["business_description", "preferred_legal_form", "number_of_founders"],
  CAPITAL: ["preferred_legal_form", "number_of_founders"],
  BENEFICIAL_OWNERS: ["number_of_founders", "preferred_legal_form"],
  NOTARY: ["preferred_legal_form", "number_of_founders", "municipality"],
  REGISTRY: ["preferred_legal_form", "municipality"],
  NIF_PROVISIONAL: ["preferred_legal_form", "business_description"],
  NIF_DEFINITIVO: ["preferred_legal_form"],
  CENSAL: ["business_description", "municipality", "preferred_legal_form"],
  CENSAL_036: ["business_description", "municipality", "preferred_legal_form", "activity_start_date"],
  SS_INSCRIPCION: ["municipality"],
  RETA: ["business_description", "municipality"],
  LOCAL_LICENCIA: ["municipality", "physical_premises", "business_description"],
  ACTIVIDAD_REGULADA: ["business_description", "municipality"],
};

const TODOS: ProfileKey[] = [
  "business_description",
  "preferred_legal_form",
  "number_of_founders",
  "municipality",
  "physical_premises",
];

/** Un valor legible. `false` es una respuesta, no un hueco. */
function comoTexto(campo: ProfileKey, valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  if (campo === "physical_premises") return valor === true ? "Sí, con local" : "Sin local abierto al público";
  if (campo === "preferred_legal_form") {
    const forma = String(valor).toUpperCase();
    if (forma === "AUTONOMO") return "Autónomo";
    if (forma === "SL") return "Sociedad Limitada";
    if (forma === "SLU") return "Sociedad Limitada Unipersonal";
    return forma;
  }
  if (campo === "number_of_founders") {
    const total = Number(valor);
    if (!Number.isFinite(total) || total < 1) return null;
    return total === 1 ? "1 persona" : `${total} personas`;
  }
  return String(valor).trim() || null;
}

export type EntradaDeCarpeta = {
  task: DerivedTask;
  /** El itinerario entero, para resolver qué trámite bloquea a cuál. */
  itinerario: DerivedTask[];
  profile: Partial<Record<ProfileKey, unknown>>;
  /** Documentos ya aportados a ESTE trámite, por categoría. */
  documentos: Array<{ id: string; category: DocumentCategory; displayName: string }>;
};

export function buildCarpeta(entrada: EntradaDeCarpeta): Carpeta {
  const { task, itinerario, profile, documentos } = entrada;

  const pedidos = DATOS_POR_TRAMITE[task.code] ?? TODOS;
  const datos: DatoDeCarpeta[] = [];
  const faltan: HuecoDeCarpeta[] = [];
  for (const campo of pedidos) {
    const texto = comoTexto(campo, profile[campo]);
    if (texto === null) {
      faltan.push({ campo, etiqueta: DATOS[campo].etiqueta, comoSeConsigue: DATOS[campo].comoSeConsigue });
    } else {
      datos.push({ campo, etiqueta: DATOS[campo].etiqueta, valor: texto });
    }
  }

  const porCategoria = new Map<string, { id: string; displayName: string }>();
  for (const documento of documentos) {
    if (!porCategoria.has(documento.category)) {
      porCategoria.set(documento.category, { id: documento.id, displayName: documento.displayName });
    }
  }

  const papelesAportados: PapelDeCarpeta[] = [];
  const papelesQueFaltan: PapelDeCarpeta[] = [];
  for (const codigo of task.requiredDocuments) {
    const category = codigo as DocumentCategory;
    const etiqueta = CATEGORY_LABEL[category] ?? codigo;
    const aportado = porCategoria.get(codigo);
    if (aportado) {
      papelesAportados.push({ category, etiqueta, documentId: aportado.id, nombre: aportado.displayName });
    } else {
      papelesQueFaltan.push({ category, etiqueta });
    }
  }

  const porCodigo = new Map(itinerario.map((otro) => [otro.code, otro]));
  const bloqueadoPor: Bloqueo[] = [];
  for (const codigo of task.dependencyCodes) {
    const previo = porCodigo.get(codigo);
    // Una dependencia que el itinerario no incluye no bloquea: no aplica a
    // este perfil. Inventarla como bloqueo pararía un trámite sin motivo.
    if (!previo) continue;
    if (previo.status === "COMPLETED" || previo.status === "NOT_APPLICABLE") continue;
    bloqueadoPor.push({ code: previo.code, title: previo.title, estado: previo.status });
  }

  const advertencias: string[] = [];
  if (task.pendingVerification) {
    advertencias.push(
      `El fundamento de este trámite está pendiente de comprobar contra la fuente oficial vigente: ${task.pendingVerification}`,
    );
  }
  if (!task.sourceUrl) {
    advertencias.push(
      "Este trámite no lleva enlace a fuente oficial verificada. Comprueba el procedimiento vigente antes de presentar nada.",
    );
  }
  if (task.status === "COMPLETED") {
    advertencias.push("Este trámite ya consta hecho en el expediente. La carpeta queda como copia de lo presentado.");
  }

  const listoParaPresentar =
    faltan.length === 0 &&
    papelesQueFaltan.length === 0 &&
    bloqueadoPor.length === 0 &&
    !task.pendingVerification;

  return {
    code: task.code,
    title: task.title,
    detail: task.detail,
    authority: task.authority,
    estado: task.status,
    sourceUrl: task.sourceUrl,
    datos,
    faltan,
    papelesAportados,
    papelesQueFaltan,
    bloqueadoPor,
    advertencias,
    listoParaPresentar,
    verificacion: task.verificationMethod,
  };
}

/** Lo que hay que hacer ahora mismo, dicho en una línea. */
export function siguientePaso(carpeta: Carpeta): string {
  if (carpeta.bloqueadoPor.length > 0) {
    return `Antes hay que cerrar: ${carpeta.bloqueadoPor.map((b) => b.title).join(", ")}.`;
  }
  if (carpeta.faltan.length > 0) {
    return `Falta un dato del expediente: ${carpeta.faltan[0].comoSeConsigue}`;
  }
  if (carpeta.papelesQueFaltan.length > 0) {
    return `Falta subir al archivo: ${carpeta.papelesQueFaltan.map((p) => p.etiqueta).join(", ")}.`;
  }
  if (carpeta.advertencias.length > 0 && !carpeta.listoParaPresentar) {
    return "Queda comprobar el fundamento del trámite antes de presentarlo.";
  }
  return "No falta nada conocido. Revisa la fuente oficial y preséntalo.";
}
