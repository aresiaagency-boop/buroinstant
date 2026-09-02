import { redirect } from "next/navigation";
import { DashboardExperience } from "@/components/DashboardExperience";
import { getCurrentActor, googleOAuthConfigured } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";

export const metadata = { title: "Expediente" };

export default async function AppPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/acceso");
  return (
    <DashboardExperience
      actor={actor}
      configuration={{ database: isDatabaseConfigured(), googleOAuth: googleOAuthConfigured }}
    />
  );
}
