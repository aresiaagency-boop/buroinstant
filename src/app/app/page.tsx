import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { DashboardExperience } from "@/components/DashboardExperience";
import { getCurrentActor, googleOAuthConfigured, isSuperAdmin } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { touchLastSeen } from "@/lib/admin-repository";

export const metadata = { title: "Expediente" };

export default async function AppPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/acceso?next=%2Fapp");

  // ?voz=1 llega desde el Orbe de la portada tras el acceso con Google.
  const params = (await searchParams) ?? {};
  const openVoice = params.voz === "1" && actor.mode === "oauth";

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
        openVoiceOnMount={openVoice}
      />
    </AppChrome>
  );
}
