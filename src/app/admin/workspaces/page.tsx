import { isDatabaseConfigured } from "@/lib/db";
import { listWorkspaces } from "@/lib/admin-repository";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espacios" };

export default async function AdminWorkspacesPage() {
  if (!isDatabaseConfigured()) {
    return <p className="admin-empty">La base de datos no está configurada en este entorno.</p>;
  }
  const workspaces = await listWorkspaces();
  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">TENENCIA</p>
        <h1>Espacios de trabajo</h1>
        <p className="admin-lede">Quién tiene qué. Cada espacio aísla sus expedientes del resto.</p>
      </header>
      <div className="admin-scroller">
        <table>
          <thead><tr><th>Espacio</th><th>Propietario</th><th>Miembros</th><th>Expedientes</th><th>Creado</th></tr></thead>
          <tbody>
            {workspaces.map((workspace) => (
              <tr key={workspace.id}>
                <td><strong>{workspace.name}</strong><small className="cell-sub mono">{workspace.id}</small></td>
                <td>{workspace.owner_email ?? "—"}</td>
                <td className="mono">{workspace.members}</td>
                <td className="mono">{workspace.projects}</td>
                <td className="mono">{new Date(workspace.created_at).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
            {workspaces.length === 0 ? (
              <tr><td colSpan={5} className="admin-empty">Ningún espacio creado todavía.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
