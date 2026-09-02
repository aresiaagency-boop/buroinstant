import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Política de privacidad y tratamiento de datos de BUROINSTANT.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link href="/" aria-label="Volver a BUROINSTANT"><BrandMark /></Link>
        <Link className="quiet-link" href="/">Volver</Link>
      </header>
      <article className="legal-card">
        <p className="eyebrow">TRANSPARENCIA · DATOS</p>
        <h1>Política de privacidad</h1>
        <p className="legal-updated">Última actualización: 2 de septiembre de 2026</p>

        <h2>1. Responsable y alcance</h2>
        <p>BUROINSTANT, producto de ARESIA, trata los datos que facilitas para prestar el servicio de creación y gestión de expedientes empresariales. Para consultas sobre privacidad puedes escribir a <a href="mailto:aresiaagency@gmail.com">aresiaagency@gmail.com</a>.</p>

        <h2>2. Datos tratados</h2>
        <p>Podemos tratar datos de cuenta, datos de contacto, información de tu proyecto empresarial, mensajes y documentos que decidas incorporar, metadatos técnicos y registros de seguridad. Si conectas Google, recibimos los datos básicos de identidad autorizados por ti: nombre, correo e identificador de cuenta.</p>

        <h2>3. Finalidades</h2>
        <p>Usamos los datos para autenticarte, mantener un expediente único, procesar información enviada desde web o WhatsApp, mostrar el progreso, prevenir fraude, mantener trazabilidad y responder a tus solicitudes. No vendemos datos personales ni los usamos para publicidad comportamental.</p>

        <h2>4. Base, conservación y encargados</h2>
        <p>El tratamiento se apoya en la ejecución del servicio solicitado, tu consentimiento cuando corresponda y obligaciones legítimas de seguridad. Conservamos los datos mientras la cuenta o el expediente estén activos y durante los plazos necesarios para atender responsabilidades. Proveedores de infraestructura, base de datos, automatización e IA pueden actuar como encargados bajo instrucciones y medidas de seguridad.</p>

        <h2>5. Decisiones y documentos sensibles</h2>
        <p>Las propuestas automatizadas son orientativas. Los datos de mayor riesgo requieren confirmación y, cuando proceda, revisión profesional. No incorpores documentación personal de terceros sin autorización.</p>

        <h2>6. Derechos</h2>
        <p>Puedes solicitar acceso, rectificación, supresión, oposición, limitación o portabilidad escribiendo al correo de contacto e identificando tu cuenta. También puedes revocar el acceso de Google desde tu cuenta de Google.</p>

        <h2>7. Seguridad y cambios</h2>
        <p>Aplicamos controles de acceso, separación por espacio de trabajo, cifrado de transporte, registros de auditoría e idempotencia de eventos. Ningún sistema es infalible; comunicaremos cambios materiales publicando una versión actualizada de esta política.</p>
      </article>
    </main>
  );
}
