import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { upcomingObligations, urgencyOf } from "@/lib/obligations-calendar";
import { readLatestProject } from "@/lib/project-profile";
import type { ProjectProfile } from "@/lib/task-engine";
import { INFORMATIONAL_FOOTER } from "@/lib/regulatory-facts";

/**
 * Calendario de obligaciones del expediente abierto.
 *
 * Traduce lo respondido en el panel al perfil que entiende el calendario y
 * devuelve, ordenadas por fecha, las obligaciones que vienen: qué modelo, qué
 * plazo, quién responde y con qué fuente oficial.
 *
 * No inventa fechas: una obligación cuyo plazo no está confirmado sale sin
 * fecha y con el aviso de qué falta comprobar.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HORIZONTE_MAXIMO = 730;

/** El expediente guarda respuestas de usuario; el calendario espera un perfil. */
function profileFromSnapshot(profile: Record<string, unknown>): Partial<ProjectProfile> {
  const forma = typeof profile.preferred_legal_form === "string" ? profile.preferred_legal_form : null;
  const legalForm =
    forma === "SL" || forma === "SLU" || forma === "SA" || forma === "AUTONOMO" ? forma : null;
  const founders = typeof profile.number_of_founders === "number" ? profile.number_of_founders : 1;
  return {
    legalForm,
    founders,
    hasPremises: profile.physical_premises === true,
  };
}

export async function GET(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED", obligations: [] }, { status: 503 });
  }

  const url = new URL(request.url);
  const pedido = Number(url.searchParams.get("dias") ?? "180");
  const horizonDays = Number.isFinite(pedido) ? Math.min(Math.max(Math.trunc(pedido), 30), HORIZONTE_MAXIMO) : 180;

  try {
    const project = await readLatestProject(actor);
    if (!project) {
      return NextResponse.json({
        project: null,
        obligations: [],
        message: "Todavía no hay expediente. Responde el primer dato y el calendario se construye solo.",
        footer: INFORMATIONAL_FOOTER,
      });
    }

    const from = new Date().toISOString().slice(0, 10);
    // La fecha del 036 marca desde cuándo corren los plazos de esta empresa.
    // Sin ella no se filtra: esconder una obligación de quien ya venía
    // funcionando sería peor que mostrar una de más.
    const inicioActividad = (project.profile as Record<string, unknown>).activity_start_date;
    const activityStart = typeof inicioActividad === "string" ? inicioActividad : undefined;

    const ocurrencias = upcomingObligations({
      profile: profileFromSnapshot(project.profile as Record<string, unknown>),
      from,
      horizonDays,
      activityStart,
    });

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      from,
      activityStart: activityStart ?? null,
      ...(activityStart
        ? {}
        : {
            aviso:
              "Todavía no has declarado la fecha de inicio de actividad, así que el calendario " +
              "puede mostrar plazos de períodos anteriores a tu empresa. Declárala y se ajusta solo.",
          }),
      horizonDays,
      // La forma jurídica manda en el calendario: si no está decidida, se dice.
      legalFormDecided: Boolean((project.profile as Record<string, unknown>).preferred_legal_form),
      obligations: ocurrencias.map((item) => ({ ...item, urgency: urgencyOf(item, from) })),
      footer: INFORMATIONAL_FOOTER,
    });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
