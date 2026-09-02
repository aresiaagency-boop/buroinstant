import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { HexagonalGravityField } from "@/components/HexagonalGravityField";
import { LandingOrb } from "@/components/LandingOrb";
import { getCurrentActor } from "@/lib/auth";

const steps = [
  {
    number: "01",
    title: "Hablas",
    body: "Pulsa el Orbe y explica tu idea con tus palabras, por voz o por escrito. También puedes escribir al WhatsApp del sistema: entra en el mismo expediente.",
  },
  {
    number: "02",
    title: "Ordeno la intención",
    body: "Convierto lo que has dicho en datos del expediente: actividad, forma jurídica, socios, municipio, local. Cada dato conserva su origen y su nivel de confianza.",
  },
  {
    number: "03",
    title: "Contrasto con la fuente oficial",
    body: "AEAT, BOE, CIRCE, Seguridad Social y Registro Mercantil antes que la suposición. Si una obligación no está verificada, se marca como pendiente de verificación en lugar de darse por buena.",
  },
  {
    number: "04",
    title: "Confirmas lo que compromete",
    body: "Los datos con consecuencia legal no se incorporan solos. Te los muestro, los confirmas y quedan registrados con la hora y la fuente.",
  },
  {
    number: "05",
    title: "Recibes la ruta",
    body: "Constitución, escritura, Registro Mercantil, alta censal, epígrafe, Seguridad Social y calendario. Cada trámite con su orden, su dependencia y su evidencia.",
  },
];

export default async function LandingPage() {
  const actor = await getCurrentActor();
  const authenticated = actor?.mode === "oauth";

  return (
    <main className="landing-shell">
      <HexagonalGravityField />
      <header className="landing-header">
        <BrandMark />
        <div className="landing-header__meta">
          <span className="live-mark"><i /> Sistema operativo empresarial</span>
          <Link className="quiet-link" href={authenticated ? "/app" : "/acceso"}>
            {authenticated ? "Mi expediente" : "Entrar"}
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">CREAR EMPRESA · ESPAÑA</p>
          <h1>
            Tu empresa,<br />
            de intención a <em>expediente.</em>
          </h1>
          <p className="landing-lede">
            Explica qué quieres construir. BUROINSTANT ordena las decisiones, verifica las
            fuentes y convierte cada paso en una ruta administrativa trazable.
          </p>
          <div className="landing-actions">
            <Link className="gold-button" href={authenticated ? "/app" : "/acceso"}>
              Comenzar mi empresa <span aria-hidden="true">↗</span>
            </Link>
            <a className="text-button" href="#sistema">
              Ver cómo funciona <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>

        <div className="landing-orb-wrap">
          <LandingOrb authenticated={authenticated} />
        </div>

        <aside className="landing-rail" aria-label="Principios del sistema">
          <div>
            <span>01</span>
            <strong>Expediente único</strong>
            <p>Web, voz y WhatsApp alimentan la misma fuente de verdad.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Fuentes oficiales</strong>
            <p>AEAT, BOE, CIRCE y Seguridad Social antes que la suposición.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Decisiones trazables</strong>
            <p>Cada dato conserva origen, confirmación y momento de verificación.</p>
          </div>
        </aside>
      </section>

      <section className="landing-system" id="sistema" aria-labelledby="sistema-titulo">
        <header className="landing-system__head">
          <p className="eyebrow">CÓMO FUNCIONA</p>
          <h2 id="sistema-titulo">Cinco pasos entre la idea y la empresa constituida.</h2>
          <p>
            No es un formulario. Es una conversación que va dejando expediente: cada
            respuesta tuya y cada consulta a una fuente oficial quedan registradas.
          </p>
        </header>

        <ol className="landing-steps">
          {steps.map((step) => (
            <li key={step.number}>
              <span className="landing-steps__number">{step.number}</span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="landing-system__cta">
          <Link className="gold-button" href={authenticated ? "/app?voz=1" : "/acceso?next=%2Fapp%3Fvoz%3D1"}>
            {authenticated ? "Hablar con el Orbe" : "Entrar con Google y hablar"}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
          <p>
            El canal de voz requiere iniciar sesión: lo que dictas se incorpora a tu
            expediente y el expediente es tuyo.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>BUROINSTANT / ARESIA</span>
        <span>Información orientativa · No sustituye asesoramiento profesional</span>
        <span className="landing-footer__links">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Condiciones</Link>
        </span>
      </footer>
    </main>
  );
}
