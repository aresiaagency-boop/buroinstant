import { isDatabaseConfigured } from "@/lib/db";
import { listIngestionEvents } from "@/lib/admin-repository";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingesta" };

function fieldNames(extracted: unknown): string {
  if (!Array.isArray(extracted)) return "—";
  const names = extracted
    .map((item) => (item && typeof item === "object" && "field" in item ? String((item as { field: unknown }).field) : null))
    .filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

export default async function AdminIngestionPage() {
  if (!isDatabaseConfigured()) {
    return <p className="admin-empty">La base de datos no está configurada en este entorno.</p>;
  }
  const events = await listIngestionEvents();
  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">CANAL OMNICANAL</p>
        <h1>Ingesta de datos</h1>
        <p className="admin-lede">
          Todo lo que entra por web y por WhatsApp, con los campos que el sistema extrajo y su
          confianza. Un dato en <code>NEEDS_CONFIRMATION</code> todavía no forma parte del expediente.
        </p>
      </header>
      <div className="admin-scroller">
        <table>
          <thead>
            <tr><th>Cuándo</th><th>Canal</th><th>Proyecto</th><th>Mensaje</th><th>Campos</th><th>Estado</th><th>Confianza</th></tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td className="mono">{new Date(event.created_at).toLocaleString("es-ES")}</td>
                <td className="mono">{event.channel} · {event.input_type}</td>
                <td>{event.project_name ?? "—"}</td>
                <td className="cell-text">{event.normalized_text.slice(0, 140)}</td>
                <td className="mono cell-text">{fieldNames(event.extracted_data)}</td>
                <td>
                  <span className={event.requires_confirmation ? "tag tag--pending" : "tag tag--active"}>
                    {event.status}
                  </span>
                </td>
                <td className="mono">{event.confidence ?? "—"}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr><td colSpan={7} className="admin-empty">Sin ingestas registradas todavía.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
