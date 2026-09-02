/**
 * Destinos internos seguros.
 *
 * El parámetro `next` viaja en una URL: es entrada no confiable. Solo se
 * acepta una ruta interna absoluta; cualquier intento de salir del dominio
 * ("//dominio.ajeno", "https://…", "/\\dominio.ajeno") cae al destino por
 * defecto.
 */
const DEFAULT_DESTINATION = "/app";

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 32;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function safeInternalPath(
  raw: string | string[] | null | undefined,
  fallback: string = DEFAULT_DESTINATION,
): string {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate !== "string") return fallback;

  const value = candidate.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("://")) return fallback;
  if (hasControlCharacters(value)) return fallback;
  if (value.length > 512) return fallback;

  return value;
}

export { DEFAULT_DESTINATION };
