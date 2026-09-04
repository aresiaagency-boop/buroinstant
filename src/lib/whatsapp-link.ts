/**
 * Vinculación del WhatsApp con la cuenta.
 *
 * La parte pura vive aquí para poder probarla sin base de datos: cómo se genera
 * un código y cómo se reconoce dentro de un mensaje. Lo demás —emitir, consumir,
 * marcar verificado— está en el repositorio.
 */

/**
 * Alfabeto sin caracteres que se confunden al leerlos en voz alta o al
 * teclearlos desde el móvil: nada de O contra 0, ni I contra 1.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 6;
export const LINK_CODE_TTL_MINUTES = 15;
export const LINK_PREFIX = "VINCULAR";

export function generateLinkCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < LINK_CODE_LENGTH; index += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Reconoce el código dentro de un mensaje de WhatsApp.
 *
 * Acepta "VINCULAR ABC234", "vincular-abc234" y el código suelto, porque nadie
 * escribe exactamente lo que se le pide. Lo que no acepta es cualquier palabra
 * de seis letras: tiene que estar el prefijo, o el mensaje entero tiene que ser
 * el código y nada más.
 */
export function parseLinkCode(text: string | null | undefined): string | null {
  const limpio = String(text ?? "").trim().toUpperCase();
  if (!limpio) return null;

  const conPrefijo = limpio.match(
    new RegExp(`${LINK_PREFIX}[\\s:_-]*([${ALPHABET}]{${LINK_CODE_LENGTH}})`),
  );
  if (conPrefijo) return conPrefijo[1] ?? null;

  const suelto = limpio.match(new RegExp(`^([${ALPHABET}]{${LINK_CODE_LENGTH}})$`));
  return suelto ? suelto[1] ?? null : null;
}

/** Muestra el número sin exponerlo entero. */
export function maskPhone(phone: string): string {
  const digitos = String(phone).replace(/\D/g, "");
  if (digitos.length < 4) return "••••";
  return `••• ••• ${digitos.slice(-3)}`;
}

/**
 * El número de WhatsApp de BUROINSTANT: el destino al que hay que escribir.
 *
 * No es un secreto —es el número público del servicio— pero tampoco se pone
 * como `NEXT_PUBLIC_`: viaja del servidor al panel como un dato más de la
 * configuración, para que no haya dos sitios donde cambiarlo.
 *
 * Devuelve null si no está configurado. Sin número, la instrucción «envía el
 * código por WhatsApp» no se puede seguir, y decirlo es mejor que fingir.
 */
export function businessNumber(env: Record<string, string | undefined> = process.env): string | null {
  const crudo = env.BUROINSTANT_WHATSAPP_NUMBER;
  if (!crudo) return null;
  const digitos = String(crudo).replace(/\D/g, "");
  // Un número internacional razonable: prefijo de país más el resto.
  if (digitos.length < 8 || digitos.length > 15) return null;
  return digitos;
}

/** +34 600 123 456, para leerlo de un vistazo. */
export function formatBusinessNumber(digits: string): string {
  const resto = digits.length > 9 ? digits.slice(-9) : digits;
  const prefijo = digits.slice(0, digits.length - resto.length);
  const grupos = resto.replace(/(\d{3})(?=\d)/g, "$1 ");
  return prefijo ? `+${prefijo} ${grupos}` : grupos;
}

/**
 * Enlace que abre WhatsApp con el mensaje ya escrito. Quita el paso de copiar
 * el código a mano, que es donde la gente se equivoca de dígito.
 */
export function waLink(digits: string, code: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${LINK_PREFIX} ${code}`)}`;
}

export function linkInstructions(code: string, digits?: string | null): string {
  if (!digits) {
    return `Escribe ${LINK_PREFIX} ${code} por WhatsApp desde el teléfono que quieras vincular. El código caduca en ${LINK_CODE_TTL_MINUTES} minutos. Falta configurar el número de BUROINSTANT al que enviarlo.`;
  }
  return `Escribe ${LINK_PREFIX} ${code} al ${formatBusinessNumber(digits)} por WhatsApp, desde el teléfono que quieras vincular. El código caduca en ${LINK_CODE_TTL_MINUTES} minutos.`;
}
