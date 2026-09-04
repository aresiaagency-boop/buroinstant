import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/db";
import { listProjectsOverview } from "@/lib/admin-repository";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expedientes" };

const STAGE_LABEL: Record<string, string> = {
  IDEA: "Idea",
  ASSESSMENT: "Diagnóstico",
  STRUCTURE: "Estructura",
  PREPARATION: "Preparación",
  INCORPORATION: "Constitución",
  REGISTRY: "Registro",
  TAX_REGISTRATION: "Alta fiscal",
  SOCIAL_SECURITY: "Seguridad Social",
  LICENSES: "Licencias",
  OPERATING: "Operativa",
};

const REVIEW_LABEL: Record<string, string> = {
  AI_REVIEWED: "Revisado por IA",
  HUMAN_REVIEW_REQUESTED: "Revisión solicitada",
  HUMAN_REVIEWED: "Revisado por persona",
};

export default async function AdminProjectsPage() {
  if (!isDatabaseConfigured()) {
    return <p className="admin-empty">La base de datos no está configurada en este entorno.</p>;
  }
  const projects = await listProjectsOverview();
  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">OPERACIÓN</p>
        <h1>Expedientes</h1>
        <p className="admin-lede">
          El mapa real del negocio: en qué fase está cada empresa en construcción y cuántas
          confirmaciones esperan a su titular. Pulsa un nombre para abrir el expediente entero:
          datos, itinerario, documentos y traza, con la opción de borrarlo.
        </p>
      </header>
      <div className="admin-scroller">
        <table>
          <thead>
            <tr><th>Proyecto</th><th>Espacio</th><th>Fase</th><th>Revisión</th><th>Pendientes</th><th>Actualizado</th></tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <Link href={`/admin/expedientes/${project.id}`} className="cell-link">
                    <strong>{project.name}</strong>
                  </Link>
                  <small className="cell-sub">{project.owner_email ?? "—"}</small>
                </td>
                <td>{project.workspace_name}</td>
                <td><span className="tag">{STAGE_LABEL[project.case_stage] ?? project.case_stage}</span></td>
                <td className="mono">{REVIEW_LABEL[project.review_state ?? ""] ?? "—"}</td>
                <td className="mono">
                  {project.pending_fields > 0 ? (
                    <span className="tag tag--pending">{project.pending_fields}</span>
                  ) : "0"}
                </td>
                <td className="mono">{new Date(project.updated_at).toLocaleString("es-ES")}</td>
              </tr>
            ))}
            {projects.length === 0 ? (
              <tr><td colSpan={6} className="admin-empty">Ningún expediente abierto todavía.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
