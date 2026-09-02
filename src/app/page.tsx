import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { HexagonalGravityField } from "@/components/HexagonalGravityField";
import { LivingGoldenOrb } from "@/components/LivingGoldenOrb";

export default function LandingPage() {
  return (
    <main className="landing-shell">
      <HexagonalGravityField />
      <header className="landing-header">
        <BrandMark />
        <div className="landing-header__meta">
          <span className="live-mark"><i /> Sistema operativo empresarial</span>
          <Link className="quiet-link" href="/acceso">Entrar</Link>
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
            <Link className="gold-button" href="/acceso">
              Comenzar mi empresa <span aria-hidden="true">↗</span>
            </Link>
            <a className="text-button" href="#sistema">Ver cómo funciona</a>
          </div>
        </div>

        <div className="landing-orb-wrap">
          <span className="orb-annotation orb-annotation--top">INTENCIÓN · 01</span>
          <LivingGoldenOrb />
          <span className="orb-annotation orb-annotation--bottom">Pulsa el Orbe para comenzar</span>
        </div>

        <aside className="landing-rail" id="sistema" aria-label="Principios del sistema">
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
