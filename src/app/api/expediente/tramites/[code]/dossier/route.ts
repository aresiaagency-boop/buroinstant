import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { readLatestProject } from "@/lib/project-profile";
import { checkEphemeralRateLimit } from "@/lib/security/rate-limit";
import { ProjectAccessError } from "@/lib/task-repository";
import { renderCarpetaHtml } from "@/lib/tramites/dossier-html";
import { TramiteNotFoundError, readCarpeta } from "@/lib/tramites/dossier-repository";

/**
 * La carpeta de presentación de un trámite.
 *
 * `GET` devuelve el JSON que pinta el panel. `?formato=html` devuelve la misma
 * carpeta como página imprimible: el navegador la convierte en PDF sin que el
 * servidor tenga que maquetar nada.
 *
 * La página imprimible sale con la política de contenido cerrada. Lleva dentro
 * datos del expediente —y nombres de fichero que pueden venir de WhatsApp, que
 * es entrada no confiable—, así que no debe poder cargar ni ejecutar nada.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODIGO_VALIDO = /^[A-Z][A-Z0-9_]{1,63}$/;

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const limite = checkEphemeralRateLimit(`carpeta-tramite:${actor.userId}`, {
    limit: 60,
    windowMs: 10 * 60 * 1_000,
  });
  if (!limite.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const { code } = await context.params;
  const codigo = code.toUpperCase();
  if (!CODIGO_VALIDO.test(codigo)) {
    return NextResponse.json({ error: "TRAMITE_NOT_FOUND" }, { status: 404 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) {
      return NextResponse.json(
        {
          error: "PROJECT_NOT_FOUND",
          message: "Todavía no hay expediente. Responde el primer dato y el itinerario se construye solo.",
        },
        { status: 404 },
      );
    }

    const carpeta = await readCarpeta({ actor, projectId: project.id, taskCode: codigo });

    const formato = new URL(request.url).searchParams.get("formato");
    if (formato === "html") {
      return new NextResponse(renderCarpetaHtml(carpeta), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
        },
      });
    }

    return NextResponse.json({ carpeta }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Un trámite que no está en este itinerario y uno inexistente responden lo
    // mismo: así no se puede averiguar qué trámites tiene otra persona.
    if (error instanceof TramiteNotFoundError || error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "TRAMITE_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
