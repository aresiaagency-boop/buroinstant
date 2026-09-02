import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { SessionExit } from "@/components/SessionExit";
import type { Actor } from "@/types/domain";

/**
 * Barra común a toda la aplicación autenticada: identidad de marca que devuelve
 * al inicio, acceso al panel de administración cuando corresponde y salida.
 * Ninguna pantalla debe quedar sin puerta de salida.
 */
export function AppChrome({
  actor,
  superAdmin = false,
  section,
  children,
}: {
  actor: Actor;
  superAdmin?: boolean;
  section?: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="app-chrome">
        <Link href="/" className="chrome-brand" aria-label="Volver al inicio de BUROINSTANT">
          <BrandMark />
        </Link>
        {section ? <span className="chrome-section">{section}</span> : null}
        <div className="chrome-actions">
          <Link href="/app" className="chrome-link">Expediente</Link>
          {superAdmin ? (
            <Link href="/admin" className="chrome-link chrome-link--admin">Administración</Link>
          ) : null}
          <span className="chrome-identity" title={actor.email}>
            {actor.mode === "local_preview" ? "Demostración local" : actor.email}
          </span>
          <SessionExit mode={actor.mode} />
        </div>
      </header>
      {children}
    </>
  );
}
