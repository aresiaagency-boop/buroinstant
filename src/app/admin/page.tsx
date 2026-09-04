import { isDatabaseConfigured } from "@/lib/db";
import { readPlatformTotals, readAdminAuditTrail } from "@/lib/admin-repository";
import Link from "next/link";
import { readServiceMatrix } from "@/lib/service-matrix";
import { superAdminEmails } from "@/lib/authorization";

export const dynamic = "force-dynamic";
export const metadata = { title: "Servicios" };

const STATUS_LABEL: Record<string, string> = {
  OK: "Operativo",
  DEGRADED: "Degradado",
  NOT_CONFIGURED: "Sin configurar",
  ERROR: "Caído",
};

/**
 * Qué se controla en cada sitio. Un panel de administración sin este mapa
 * obliga a entrar en cada pestaña para descubrir qué hace: aquí se dice antes.
 */
const CONTROL_MAP = [
  {
    href: "/admin/usuarios",
    title: "Personas",
    can: "Ver quién ha entrado, aceptar a quien está pendiente, suspender y borrar cuentas.",
    limit: "Un superadministrador no puede suspenderse ni borrarse a sí mismo, y quien tenga espacios creados no se borra sin decidir antes qué pasa con sus expedientes.",
  },
  {
    href: "/admin/workspaces",
    title: "Espacios",
    can: "Ver cada espacio de trabajo, quién lo creó y cuántas personas y expedientes tiene dentro.",
    limit: "Los datos de un espacio no se mezclan con los de otro en ninguna consulta del producto.",
  },
  {
    href: "/admin/expedientes",
    title: "Expedientes",
    can: "Abrir cualquier empresa en construcción: lo respondido, el itinerario con su evidencia, los documentos y la traza. Y borrarla entera.",
    limit: "Los documentos se ven por sus metadatos. El contenido está cifrado y no se descifra desde el control: auditar no es leer el DNI de nadie.",
  },
  {
    href: "/admin/ingesta",
    title: "Ingesta",
    can: "Ver qué ha entrado por WhatsApp y por voz, qué campos se extrajeron y cuáles quedaron esperando confirmación.",
    limit: "Todo lo que llega por un canal externo se trata como no fiable hasta que lo confirma su titular.",
  },
  {
    href: "/admin/fuentes",
    title: "Fuentes",
    can: "Ver qué sedes oficiales se han consultado, cuándo respondieron y con qué contenido.",
    limit: "Sólo se consultan instituciones del Estado. Ninguna respuesta de una fuente no oficial entra en un expediente.",
  },
  {
    href: "/admin/calidad-ia",
    title: "Calidad IA",
    can: "Marcar cada respuesta del agente como correcta, parcial, incorrecta o con fuente caducada.",
    limit: "Lo que no se mide no mejora: esta es la única vía para saber si el agente está respondiendo bien.",
  },
];

export default async function AdminOverviewPage() {
  const services = await readServiceMatrix();
  const connected = isDatabaseConfigured();
  const totals = connected ? await readPlatformTotals() : null;
  const trail = connected ? await readAdminAuditTrail(8) : [];
  const acceso = superAdminEmails();

  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">CONTROL DE BUROINSTANT</p>
        <h1>Superadministración</h1>
        <p className="admin-lede">
          Desde aquí se ve y se decide sobre todo el ecosistema: personas, espacios, expedientes,
          lo que entra por los canales, las fuentes oficiales que se consultan y la calidad de lo
          que responde el agente. Cada acción queda registrada con quién la hizo.
        </p>
        <p className="admin-access">
          Acceso restringido a {acceso.length === 0 ? "nadie: la lista de superadministradores está vacía" : acceso.join(", ")}.
          La lista vive en el entorno, no en el código, para poder conceder o retirar autoridad sin
          desplegar. La sesión de demostración nunca da esta autoridad.
        </p>
      </header>

      <section className="admin-map" aria-label="Qué se controla en cada sitio">
        {CONTROL_MAP.map((area) => (
          <Link key={area.href} href={area.href} className="admin-map__card">
            <strong>{area.title}</strong>
            <p>{area.can}</p>
            <small>{area.limit}</small>
          </Link>
        ))}
      </section>

      {totals ? (
        <section className="admin-totals" aria-label="Cifras de la plataforma">
          <div><strong>{totals.users}</strong><span>Personas</span></div>
          <div><strong>{totals.pendingUsers}</strong><span>Pendientes de aceptar</span></div>
          <div><strong>{totals.workspaces}</strong><span>Espacios</span></div>
          <div><strong>{totals.projects}</strong><span>Expedientes</span></div>
          <div><strong>{totals.ingestionLast7d}</strong><span>Ingestas 7 días</span></div>
          <div><strong>{totals.pendingConfirmations}</strong><span>Confirmaciones abiertas</span></div>
        </section>
      ) : null}

      <h2 className="admin-section-title">Estado de los servicios</h2>
      <p className="admin-lede">
        Comprobado al cargar esta página. Las claves de proveedores de IA se informan como
        configuradas o no: no se gasta una llamada sólo para pintar un semáforo.
      </p>
      <section className="admin-matrix">
        {services.map((service) => (
          <article key={service.key} className={`svc svc--${service.status.toLowerCase()}`}>
            <header>
              <strong>{service.name}</strong>
              <span className="svc-badge">{STATUS_LABEL[service.status] ?? service.status}</span>
            </header>
            <p className="svc-purpose">{service.purpose}</p>
            <p className="svc-detail">
              {service.detail}
              {service.latencyMs !== null ? ` · ${service.latencyMs} ms` : ""}
            </p>
          </article>
        ))}
      </section>

      {trail.length > 0 ? (
        <section className="admin-block">
          <h2>Últimas acciones administrativas</h2>
          <div className="admin-scroller">
            <table>
              <thead>
                <tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Entidad</th></tr>
              </thead>
              <tbody>
                {trail.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{new Date(entry.created_at).toLocaleString("es-ES")}</td>
                    <td>{entry.actor_email}</td>
                    <td className="mono">{entry.action}</td>
                    <td className="mono">{entry.entity_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
