import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Condiciones del servicio",
  description: "Condiciones de uso de BUROINSTANT.",
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link href="/" aria-label="Volver a BUROINSTANT"><BrandMark /></Link>
        <Link className="quiet-link" href="/">Volver</Link>
      </header>
      <article className="legal-card">
        <p className="eyebrow">SERVICIO · CONDICIONES</p>
        <h1>Condiciones del servicio</h1>
        <p className="legal-updated">Última actualización: 2 de septiembre de 2026</p>

        <h2>1. Servicio</h2>
        <p>BUROINSTANT organiza información y tareas para crear y gestionar una empresa en España. El servicio puede integrar web, Google, WhatsApp, automatizaciones y fuentes públicas en un mismo expediente.</p>

        <h2>2. Cuenta y uso autorizado</h2>
        <p>Debes facilitar información veraz, proteger el acceso a tu cuenta y usar el servicio solo para fines legítimos. No puedes intentar acceder a expedientes ajenos, eludir controles, introducir código malicioso ni usar el sistema para suplantar a terceros.</p>

        <h2>3. Alcance de las respuestas</h2>
        <p>Las respuestas, diagnósticos y rutas son información orientativa y no sustituyen asesoramiento jurídico, fiscal, laboral, contable o notarial. Las decisiones de riesgo y las presentaciones oficiales requieren confirmación humana y, cuando corresponda, intervención profesional.</p>

        <h2>4. Datos y contenido</h2>
        <p>Conservas tus derechos sobre el contenido que aportas y autorizas su tratamiento para prestar el servicio. Eres responsable de contar con base legítima para incorporar datos o documentos de otras personas.</p>

        <h2>5. Disponibilidad e integraciones</h2>
        <p>Trabajamos para mantener el servicio disponible, pero proveedores externos o administraciones pueden cambiar, interrumpirse o responder con demora. Identificaremos las fuentes y evitaremos presentar como confirmado aquello que no haya sido verificado.</p>

        <h2>6. Suspensión y finalización</h2>
        <p>Podemos limitar usos que comprometan la seguridad, infrinjan estas condiciones o afecten a terceros. Puedes dejar de usar el servicio y solicitar la eliminación de tu cuenta conforme a la política de privacidad.</p>

        <h2>7. Contacto</h2>
        <p>Para consultas sobre estas condiciones escribe a <a href="mailto:aresiaagency@gmail.com">aresiaagency@gmail.com</a>.</p>
      </article>
    </main>
  );
}
