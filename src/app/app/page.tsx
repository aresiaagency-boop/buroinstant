import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { DashboardExperience } from "@/components/DashboardExperience";
import { getCurrentActor, googleOAuthConfigured, isSuperAdmin } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { touchLastSeen } from "@/lib/admin-repository";

export const metadata = { title: "Expediente" };

export default async function AppPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/acceso");

  // Marca de actividad para el panel de administración. Nunca bloquea la página.
  if (isDatabaseConfigured() && actor.mode === "oauth") {
    try {
      await touchLastSeen(actor.email);
    } catch {
      // La telemetría de actividad no puede impedir que alguien entre en su expediente.
    }
  }

  return (
    <AppChrome actor={actor} superAdmin={isSuperAdmin(actor)}>
      <DashboardExperience
        actor={actor}
        configuration={{ database: isDatabaseConfigured(), googleOAuth: googleOAuthConfigured }}
      />
    </AppChrome>
  );
}
