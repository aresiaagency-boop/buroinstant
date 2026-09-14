/**
 * Qué se acepta en el archivo de documentos.
 *
 * El tipo que declara el navegador es un dato del cliente: se comprueba contra
 * los bytes reales del archivo. Un ejecutable renombrado a .pdf declara
 * `application/pdf` y hay que rechazarlo por lo que es, no por lo que dice.
 */

export const DOCUMENT_CATEGORIES = [
  "IDENTITY",
  "COMPANY_NAME",
  "BYLAWS",
  "NOTARY",
  "TAX",
  "REGISTRY",
  "SOCIAL_SECURITY",
  "LICENSE",
  "BANK",
  "CONTRACT",
  "INVOICE",
  "OTHER",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Etiquetas en la lengua de quien crea la empresa, no en la del esquema. */
export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  IDENTITY: "Identidad",
  COMPANY_NAME: "Denominación social",
  BYLAWS: "Estatutos",
  NOTARY: "Notaría",
  TAX: "Agencia Tributaria",
  REGISTRY: "Registro Mercantil",
  SOCIAL_SECURITY: "Seguridad Social",
  LICENSE: "Licencias",
  BANK: "Banco",
  CONTRACT: "Contratos",
  INVOICE: "Facturas",
  OTHER: "Otros",
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MIN_DOCUMENT_BYTES = 8;

type Signature = { mime: string; extension: string; matches: (bytes: Buffer) => boolean };

const empiezaPor = (bytes: Buffer, prefix: number[]) =>
  bytes.length >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);

/**
 * Firmas de los formatos admitidos. Sólo formatos que una administración
 * española acepta o emite: PDF, imágenes de un documento escaneado y los
 * ofimáticos que se piden en algunas sedes.
 */
const SIGNATURES: Signature[] = [
  { mime: "application/pdf", extension: "pdf", matches: (b) => empiezaPor(b, [0x25, 0x50, 0x44, 0x46]) },
  { mime: "image/jpeg", extension: "jpg", matches: (b) => empiezaPor(b, [0xff, 0xd8, 0xff]) },
  {
    mime: "image/png",
    extension: "png",
    matches: (b) => empiezaPor(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: "image/webp",
    extension: "webp",
    matches: (b) =>
      empiezaPor(b, [0x52, 0x49, 0x46, 0x46]) &&
      b.length >= 12 &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  {
    mime: "image/tiff",
    extension: "tif",
    matches: (b) => empiezaPor(b, [0x49, 0x49, 0x2a, 0x00]) || empiezaPor(b, [0x4d, 0x4d, 0x00, 0x2a]),
  },
];

/** Los ofimáticos modernos son ZIP por dentro; se distinguen por su contenido. */
const ZIP_PREFIX = [0x50, 0x4b, 0x03, 0x04];

const OOXML: Array<{ marker: string; mime: string; extension: string }> = [
  {
    marker: "word/",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  {
    marker: "xl/",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
];

export type DetectedType = { mime: string; extension: string };

/** Devuelve el tipo real según los bytes, o null si no es un formato admitido. */
export function detectType(bytes: Buffer): DetectedType | null {
  for (const signature of SIGNATURES) {
    if (signature.matches(bytes)) return { mime: signature.mime, extension: signature.extension };
  }
  if (empiezaPor(bytes, ZIP_PREFIX)) {
    // Basta con mirar la cabecera del ZIP: los OOXML llevan su carpeta al principio.
    const cabecera = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("latin1");
    for (const candidato of OOXML) {
      if (cabecera.includes(candidato.marker)) {
        return { mime: candidato.mime, extension: candidato.extension };
      }
    }
  }
  return null;
}

export type ValidationResult =
  | { ok: true; type: DetectedType }
  | { ok: false; error: string; message: string };

export function validateUpload(input: {
  bytes: Buffer;
  declaredName: string;
  category: string;
}): ValidationResult {
  if (input.bytes.length < MIN_DOCUMENT_BYTES) {
    return { ok: false, error: "DOCUMENT_EMPTY", message: "El archivo está vacío o es demasiado corto." };
  }
  if (input.bytes.length > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: "DOCUMENT_TOO_LARGE",
      message: `El archivo supera los ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. Escanéalo con menos resolución o divídelo.`,
    };
  }
  if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(input.category)) {
    return { ok: false, error: "CATEGORY_UNKNOWN", message: "Esa carpeta del expediente no existe." };
  }
  const type = detectType(input.bytes);
  if (!type) {
    return {
      ok: false,
      error: "DOCUMENT_TYPE_NOT_ALLOWED",
      message: "Sólo admito PDF, imágenes escaneadas (JPG, PNG, WEBP, TIFF) y documentos Word o Excel.",
    };
  }
  const nombre = sanitizeFileName(input.declaredName, type.extension);
  if (!nombre) {
    return { ok: false, error: "NAME_INVALID", message: "El nombre del archivo no es utilizable." };
  }
  return { ok: true, type };
}

/**
 * Deja el nombre en algo que puede mostrarse y descargarse sin que sirva para
 * escaparse de una carpeta ni para inyectar cabeceras: sin rutas, sin comillas
 * y sin caracteres de control.
 */
export function sanitizeFileName(raw: string, fallbackExtension: string): string {
  const soloNombre = raw.split(/[\\/]/).pop() ?? "";
  let limpio = "";
  for (const punto of soloNombre) {
    const codigo = punto.codePointAt(0) ?? 0;
    if (codigo < 32 || codigo === 127) continue;
    if (punto === '"' || punto === "'" || punto === ";" || punto === "\\") continue;
    limpio += punto;
  }
  limpio = limpio.trim().replace(/\s+/g, " ").replace(/^\.+/, "");
  if (limpio.length > 120) {
    const punto = limpio.lastIndexOf(".");
    const extension = punto > 0 ? limpio.slice(punto) : "";
    limpio = `${limpio.slice(0, 120 - extension.length).trimEnd()}${extension}`;
  }
  if (!limpio) return "";
  if (!limpio.toLowerCase().endsWith(`.${fallbackExtension}`)) {
    limpio = `${limpio}.${fallbackExtension}`;
  }
  return limpio;
}

/**
 * Qué documentos pide el expediente según lo respondido. Cada uno dice por qué
 * se pide: pedir papeles sin explicar para qué es lo que hace odiosa una
 * gestoría.
 */
export type DocumentRequirement = {
  category: DocumentCategory;
  title: string;
  why: string;
  required: boolean;
};

export function requirementsFor(profile: {
  legalForm?: string | null;
  hasPremises?: boolean;
  founders?: number;
}): DocumentRequirement[] {
  const forma = profile.legalForm ?? null;
  const esSociedad = forma !== null && forma !== "AUTONOMO";
  const lista: DocumentRequirement[] = [
    {
      category: "IDENTITY",
      title: "DNI o NIE de cada persona",
      why: "Sin identificar a quien firma no hay trámite posible: lo piden notaría, banco y Agencia Tributaria.",
      required: true,
    },
  ];

  if (esSociedad) {
    lista.push(
      {
        category: "CONTRACT",
        title: "Autorización de domiciliación social",
        why:
          "Si el domicilio no es tuyo —un coworking, un despacho alquilado—, el titular tiene que " +
          "autorizar expresamente que domicilies ahí la sociedad. Sin eso el Registro puede no inscribir.",
        required: true,
      },
      {
        category: "COMPANY_NAME",
        title: "Certificación negativa de denominación social",
        why: "Acredita que el nombre elegido está libre. La notaría no otorga la escritura sin ella.",
        required: true,
      },
      {
        category: "BYLAWS",
        title: "Estatutos sociales",
        why: "Son las reglas internas de la sociedad. Van dentro de la escritura de constitución.",
        required: true,
      },
      {
        category: "BANK",
        title: "Certificado bancario del desembolso del capital",
        why: "Acredita que el capital social se ha ingresado. Es requisito para constituir.",
        required: true,
      },
      {
        category: "NOTARY",
        title: "Escritura de constitución",
        why: "Es el acta de nacimiento de la sociedad y lo que se lleva al Registro Mercantil.",
        required: true,
      },
      {
        category: "REGISTRY",
        title: "Inscripción en el Registro Mercantil",
        why: "Hasta inscribirse, la sociedad no tiene personalidad jurídica plena.",
        required: true,
      },
      {
        category: "INVOICE",
        title: "Primera factura emitida",
        why:
          "Es la prueba de que la empresa no sólo existe, sino que funciona. Es el paso que cierra " +
          "el expediente, y su fecha no puede ser anterior al inicio de actividad declarado.",
        required: true,
      },
    );
  }

  lista.push({
    category: "TAX",
    title: "Alta censal presentada",
    why: "Es la declaración con la que te das de alta ante la Agencia Tributaria y quedan fijadas tus obligaciones.",
    required: true,
  });

  lista.push({
    category: "SOCIAL_SECURITY",
    title: "Alta en la Seguridad Social",
    why: "Alta del titular y, si vas a contratar, inscripción de la empresa como tal.",
    required: true,
  });

  if (profile.hasPremises) {
    lista.push({
      category: "LICENSE",
      title: "Título del local y licencia municipal",
      why: "El ayuntamiento pide acreditar el uso del local antes de permitir la actividad en él.",
      required: false,
    });
  }

  return lista;
}
