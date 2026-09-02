import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { HexagonalGravityField } from "@/components/HexagonalGravityField";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { LivingGoldenOrb } from "@/components/LivingGoldenOrb";
import { googleOAuthConfigured } from "@/lib/auth";
import { safeInternalPath } from "@/lib/navigation";

export const metadata = { title: "Acceso" };

export default async function AccessPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const destination = safeInternalPath(params.next);
  const wantsVoice = destination.includes("voz=1");
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
        <h1>
          {wantsVoice ? "Habla con el Orbe desde tu cuenta." : "Tu empresa continúa donde la dejaste."}
        </h1>
        <p>
          {wantsVoice
            ? "El canal de voz escribe en tu expediente. Por eso pide identidad antes de escuchar: al terminar el acceso vuelves directamente al Orbe."
            : "La cuenta vincula tus proyectos, fuentes, tareas y conversaciones en un único expediente empresarial."}
        </p>
        {googleOAuthConfigured ? (
          <GoogleSignInButton callbackUrl={destination} />
        ) : (
          <button className="google-button" type="button" disabled>
            <span aria-hidden="true">G</span> Google OAuth pendiente de configuración
          </button>
        )}
        {localPreview && (
          <form action="/api/auth/demo" method="post">
            <input type="hidden" name="next" value={destination} />
            <button className="preview-button" type="submit">Abrir demostración local</button>
          </form>
        )}
        <small>
          Al continuar aceptas el tratamiento necesario para prestar el servicio. Las
          comunicaciones comerciales permanecen desactivadas por defecto.
        </small>
        <Link className="text-button" href="/">Volver al inicio</Link>
      </section>
      <p className="access-security">Sesión HttpOnly · CSRF · Acceso por tenant · Auditoría</p>
    </main>
  );
}
