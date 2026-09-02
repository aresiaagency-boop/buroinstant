import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { HexagonalGravityField } from "@/components/HexagonalGravityField";
import { LivingGoldenOrb } from "@/components/LivingGoldenOrb";
import { googleOAuthConfigured } from "@/lib/auth";

export const metadata = { title: "Acceso" };

export default function AccessPage() {
  const localPreview = process.env.NODE_ENV !== "production";
  return (
    <main className="access-shell">
      <HexagonalGravityField />
      <header className="minimal-header">
        <Link href="/" aria-label="Volver al inicio"><BrandMark /></Link>
        <span>ACCESO SEGURO</span>
      </header>
      <section className="access-panel">
        <div className="access-orb"><LivingGoldenOrb size="small" /></div>
        <p className="eyebrow">IDENTIDAD · WORKSPACE · EXPEDIENTE</p>
        <h1>Tu empresa continúa donde la dejaste.</h1>
        <p>
          La cuenta vincula tus proyectos, fuentes, tareas y conversaciones en un único
          expediente empresarial.
        </p>
        {googleOAuthConfigured ? (
          <Link className="google-button" href="/api/auth/signin/google?callbackUrl=/app">
            <span aria-hidden="true">G</span> Continuar con Google
          </Link>
        ) : (
          <button className="google-button" type="button" disabled>
            <span aria-hidden="true">G</span> Google OAuth pendiente de configuración
          </button>
        )}
        {localPreview && (
          <form action="/api/auth/demo" method="post">
            <button className="preview-button" type="submit">Abrir demostración local</button>
          </form>
        )}
        <small>
          Al continuar aceptas el tratamiento necesario para prestar el servicio. Las
          comunicaciones comerciales permanecen desactivadas por defecto.
        </small>
      </section>
      <p className="access-security">Sesión HttpOnly · CSRF · Acceso por tenant · Auditoría</p>
    </main>
  );
}
