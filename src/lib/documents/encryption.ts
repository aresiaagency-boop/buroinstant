import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cifrado de documentos en reposo.
 *
 * Un expediente lleva DNI, escrituras y poderes. Guardarlos en claro sería
 * confiar la privacidad de una persona a que nadie lea nunca la base de datos.
 *
 * Se usa cifrado sobre: cada archivo lleva su propia clave de datos aleatoria
 * (AES-256-GCM), y esa clave se guarda cifrada a su vez con la clave maestra
 * del entorno. Consecuencias buscadas:
 *   · Ver una fila de la base de datos no da acceso a nada: la clave maestra
 *     nunca está ahí, sólo en el entorno del servidor.
 *   · Rotar la clave maestra es reenvolver claves de datos, no descifrar y
 *     volver a cifrar todos los archivos.
 *   · GCM autentica: un byte cambiado en el almacén hace fallar el descifrado
 *     en vez de devolver basura silenciosamente.
 *
 * La clave maestra JAMÁS se registra, se devuelve ni viaja al navegador.
 */

/** Sólo se lee una variable, así que no hace falta el ProcessEnv completo. */
type EnvLike = Record<string, string | undefined>;

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super("DOCUMENT_ENCRYPTION_NOT_CONFIGURED");
    this.name = "EncryptionNotConfiguredError";
  }
}

export class DecryptionFailedError extends Error {
  constructor() {
    // El mensaje no distingue clave equivocada de contenido manipulado: decirlo
    // ayudaría a quien esté probando claves.
    super("DOCUMENT_DECRYPTION_FAILED");
    this.name = "DecryptionFailedError";
  }
}

/**
 * Deriva la clave maestra del entorno. Acepta 64 caracteres hexadecimales o
 * base64 de 32 bytes; cualquier otra cosa se rechaza en vez de rellenarse,
 * para que una clave corta no pase por buena.
 */
export function masterKey(env: EnvLike = process.env): Buffer {
  const raw = env.DOCUMENT_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) throw new EncryptionNotConfiguredError();
  const limpio = raw.trim();

  if (/^[0-9a-fA-F]{64}$/.test(limpio)) return Buffer.from(limpio, "hex");

  const desdeBase64 = Buffer.from(limpio, "base64");
  if (desdeBase64.length === KEY_BYTES) return desdeBase64;

  throw new EncryptionNotConfiguredError();
}

export function isEncryptionConfigured(env: EnvLike = process.env): boolean {
  try {
    masterKey(env);
    return true;
  } catch {
    return false;
  }
}

export type SealedDocument = {
  /** Contenido cifrado, con la etiqueta de autenticación al final. */
  ciphertext: Buffer;
  /** Clave de datos cifrada con la clave maestra, con su etiqueta al final. */
  wrappedKey: Buffer;
  /** Vector de inicialización del contenido. */
  iv: Buffer;
  /** Vector de inicialización del envoltorio de la clave. */
  keyIv: Buffer;
  /** SHA-256 del contenido EN CLARO, para detectar duplicados y verificar. */
  contentHash: string;
  /** Tamaño en claro, que es el que ve la persona. */
  sizeBytes: number;
};

function encrypt(key: Buffer, plaintext: Buffer): { iv: Buffer; payload: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const cifrado = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, payload: Buffer.concat([cifrado, cipher.getAuthTag()]) };
}

function decrypt(key: Buffer, iv: Buffer, payload: Buffer): Buffer {
  if (payload.length < TAG_BYTES) throw new DecryptionFailedError();
  const cuerpo = payload.subarray(0, payload.length - TAG_BYTES);
  const tag = payload.subarray(payload.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cuerpo), decipher.final()]);
  } catch {
    throw new DecryptionFailedError();
  }
}

/** Cifra un documento. El resultado sólo contiene datos que pueden guardarse. */
export function sealDocument(plaintext: Buffer, key: Buffer = masterKey()): SealedDocument {
  if (plaintext.length === 0) throw new Error("EMPTY_DOCUMENT");
  const dataKey = randomBytes(KEY_BYTES);
  const contenido = encrypt(dataKey, plaintext);
  const envoltorio = encrypt(key, dataKey);
  // La clave de datos en claro sale de memoria en cuanto se ha envuelto.
  dataKey.fill(0);
  return {
    ciphertext: contenido.payload,
    iv: contenido.iv,
    wrappedKey: envoltorio.payload,
    keyIv: envoltorio.iv,
    contentHash: createHash("sha256").update(plaintext).digest("hex"),
    sizeBytes: plaintext.length,
  };
}

/** Descifra un documento y comprueba que su huella coincide con la guardada. */
export function openDocument(
  sealed: Pick<SealedDocument, "ciphertext" | "wrappedKey" | "iv" | "keyIv" | "contentHash">,
  key: Buffer = masterKey(),
): Buffer {
  const dataKey = decrypt(key, sealed.keyIv, sealed.wrappedKey);
  if (dataKey.length !== KEY_BYTES) throw new DecryptionFailedError();
  const plaintext = decrypt(dataKey, sealed.iv, sealed.ciphertext);
  dataKey.fill(0);

  const esperado = Buffer.from(sealed.contentHash, "hex");
  const obtenido = createHash("sha256").update(plaintext).digest();
  if (esperado.length !== obtenido.length || !timingSafeEqual(esperado, obtenido)) {
    throw new DecryptionFailedError();
  }
  return plaintext;
}

/**
 * Reenvuelve la clave de datos con otra clave maestra. Permite rotar sin tocar
 * el contenido cifrado, que es lo caro.
 */
export function rewrapKey(
  sealed: Pick<SealedDocument, "wrappedKey" | "keyIv">,
  from: Buffer,
  to: Buffer,
): Pick<SealedDocument, "wrappedKey" | "keyIv"> {
  const dataKey = decrypt(from, sealed.keyIv, sealed.wrappedKey);
  if (dataKey.length !== KEY_BYTES) throw new DecryptionFailedError();
  const envoltorio = encrypt(to, dataKey);
  dataKey.fill(0);
  return { wrappedKey: envoltorio.payload, keyIv: envoltorio.iv };
}
