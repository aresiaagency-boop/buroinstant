import { QualityFlagActions } from "@/components/QualityFlagActions";
import { isDatabaseConfigured } from "@/lib/db";
import { listOfficialQueries } from "@/lib/admin-repository";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calidad IA" };

export default async function AdminQualityPage() {
  if (!isDatabaseConfigured()) {
    return <p className="admin-empty">La base de datos no está configurada en este entorno.</p>;
  }
  const queries = await listOfficialQueries();
  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">CONTROL DE CALIDAD</p>
        <h1>Respuestas del agente</h1>
        <p className="admin-lede">
          Cada consulta con su autoridad y su confianza. Marcar una respuesta es lo que permite
          detectar cuándo una fuente ha caducado antes de que lo note un usuario.
        </p>
      </header>
      <div className="admin-scroller">
        <table>
          <thead>
            <tr><th>Cuándo</th><th>Pregunta</th><th>Autoridad</th><th>Confianza</th><th>Estado</th><th>Valoración</th></tr>
          </thead>
          <tbody>
            {queries.map((query) => (
              <tr key={query.id}>
                <td className="mono">{new Date(query.created_at).toLocaleString("es-ES")}</td>
                <td className="cell-text">{query.question.slice(0, 160)}</td>
                <td className="mono">{query.statement_authority}</td>
                <td className="mono">{query.confidence ?? "—"}</td>
                <td>
                  <span className={query.status === "NO_VERIFIED_SOURCE" ? "tag tag--pending" : "tag"}>
                    {query.status}
                  </span>
                </td>
                <td><QualityFlagActions queryId={query.id} current={query.quality_flag} /></td>
              </tr>
            ))}
            {queries.length === 0 ? (
              <tr><td colSpan={6} className="admin-empty">Sin consultas registradas todavía.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
