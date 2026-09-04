import { notFound } from "next/navigation";

import { AdminProjectDossier } from "@/components/AdminProjectDossier";
import { readProjectDossier } from "@/lib/admin-repository";
import { isDatabaseConfigured } from "@/lib/db";

/**
 * Un expediente visto desde el control. El acceso ya está resuelto por el
 * layout de /admin, que exige superadministrador: esta página no vuelve a
 * decidir quién entra, sólo qué se muestra.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Expediente" };

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return <p className="admin-empty">La base de datos no está configurada en este entorno.</p>;
  }
  const { id } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) notFound();

  const dossier = await readProjectDossier(id);
  if (!dossier) notFound();

  return <AdminProjectDossier dossier={dossier} />;
}
