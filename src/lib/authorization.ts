import type { Actor } from "@/types/domain";

/**
 * Reglas de autoridad, sin dependencias de Next: se pueden probar en aislamiento.
 *
 * Los superadministradores se definen por entorno y nunca en el código, para
 * poder conceder o retirar autoridad sin desplegar. Con la variable vacía no hay
 * superadministrador: el panel queda cerrado para todo el mundo, que es el
 * comportamiento correcto por defecto.
 */
export function superAdminEmails(): string[] {
  return String(process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.trim().toLowerCase());
}

/**
 * La previsualización local nunca concede autoridad de superadministrador: si
 * lo hiciera, cualquiera con acceso al entorno de desarrollo entraría al panel.
 */
export function isSuperAdmin(actor: Actor | null | undefined): boolean {
  if (!actor || actor.mode !== "oauth") return false;
  return isSuperAdminEmail(actor.email);
}
