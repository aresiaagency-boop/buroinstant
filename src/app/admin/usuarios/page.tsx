import { UserActions } from "@/components/UserActions";
import { isDatabaseConfigured } from "@/lib/db";
import { listUsers } from "@/lib/admin-repository";
import { superAdminEmails } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuarios" };

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activa",
  SUSPENDED: "Suspendida",
};

export default async function AdminUsersPage() {
  if (!isDatabaseConfigured()) {
    return <p className="admin-empty">La base de datos no está configurada en este entorno.</p>;
  }
  const users = await listUsers();
  const admins = new Set(superAdminEmails());

  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">CUENTAS</p>
        <h1>Usuarios</h1>
        <p className="admin-lede">
          Aceptación, suspensión y eliminación. Cada acción queda registrada con quién la hizo y
          cuándo. Una cuenta suspendida conserva sus datos: no es un borrado encubierto.
        </p>
      </header>

      <div className="admin-scroller">
        <table>
          <thead>
            <tr>
              <th>Persona</th><th>Estado</th><th>Espacios</th><th>Expedientes</th>
              <th>WhatsApp</th><th>Alta</th><th>Última actividad</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.full_name}</strong>
                  <small className="cell-sub">{user.email}</small>
                  {admins.has(user.email.toLowerCase()) ? (
                    <span className="tag tag--admin">Superadmin</span>
                  ) : null}
                </td>
                <td>
                  <span className={`tag tag--${user.account_status.toLowerCase()}`}>
                    {STATUS_LABEL[user.account_status] ?? user.account_status}
                  </span>
                  {user.suspended_reason ? <small className="cell-sub">{user.suspended_reason}</small> : null}
                </td>
                <td className="mono">{user.workspaces}</td>
                <td className="mono">{user.projects}</td>
                <td className="mono">{user.whatsapp_linked ? "Vinculado" : "—"}</td>
                <td className="mono">{new Date(user.created_at).toLocaleDateString("es-ES")}</td>
                <td className="mono">
                  {user.last_seen_at ? new Date(user.last_seen_at).toLocaleString("es-ES") : "—"}
                </td>
                <td>
                  {admins.has(user.email.toLowerCase()) ? (
                    <small className="cell-sub">Protegida</small>
                  ) : (
                    <UserActions userId={user.id} status={user.account_status} />
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr><td colSpan={8} className="admin-empty">Todavía no hay cuentas registradas.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
