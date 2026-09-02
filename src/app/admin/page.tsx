import { isDatabaseConfigured } from "@/lib/db";
import { readPlatformTotals, readAdminAuditTrail } from "@/lib/admin-repository";
import { readServiceMatrix } from "@/lib/service-matrix";

export const dynamic = "force-dynamic";
export const metadata = { title: "Servicios" };

const STATUS_LABEL: Record<string, string> = {
  OK: "Operativo",
  DEGRADED: "Degradado",
  NOT_CONFIGURED: "Sin configurar",
  ERROR: "Caído",
};

export default async function AdminOverviewPage() {
  const services = await readServiceMatrix();
  const connected = isDatabaseConfigured();
  const totals = connected ? await readPlatformTotals() : null;
  const trail = connected ? await readAdminAuditTrail(8) : [];

  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">MATRIZ DE SERVICIOS</p>
        <h1>Estado de la plataforma</h1>
        <p className="admin-lede">
          Comprobado en el momento de cargar esta página. Las claves de proveedores de IA se
          informan como configuradas o no: no se gasta una llamada sólo para pintar un semáforo.
        </p>
      </header>

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
