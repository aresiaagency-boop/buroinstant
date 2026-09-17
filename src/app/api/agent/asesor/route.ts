import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { readTaskDocuments } from "@/lib/documents/evidence-repository";
import { upcomingObligations } from "@/lib/obligations-calendar";
import { readLatestProject, readProjectSnapshot } from "@/lib/project-profile";
import { ProjectAccessError, listTasks, syncTasks } from "@/lib/task-repository";
import { readDenominations } from "@/lib/tramites/denominations";
import type { ProjectProfile } from "@/lib/task-engine";
import {
  INFORMATIONAL_FOOTER,
  SinProveedorError,
  consultarAsesor,
  proveedorConfigurado,
  type ContextoDelExpediente,
} from "@/lib/agent/asesor";

/**
 * El orbe con un asesor detrás.
 *
 * La ruta vieja, `/api/agent/chat`, sigue donde estaba: extrae datos de una
 * frase con reglas y no razona. Ésta es la que atiende una instrucción
 * cualquiera —«¿qué me falta para firmar?», «cambia el municipio a Palma»,
 * «¿me interesa 1 € de capital?»— con el expediente entero delante.
 *
 * Lo que devuelve no toca nada. Las propuestas se aplican desde el panel, con
 * la confirmación de quien es titular del expediente: un dato con consecuencia
 * legal no entra porque alguien lo escribiera en un chat.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  projectId: z.string().uuid().optional(),
  text: z.string().trim().min(2).max(4_000),
  historial: z
    .array(z.object({ rol: z.enum(["user", "assistant"]), texto: z.string().max(4_000) }))
    .max(12)
    .optional(),
});

function perfilParaMotor(profile: Record<string, unknown>): Partial<ProjectProfile> {
  const forma = typeof profile.preferred_legal_form === "string" ? profile.preferred_legal_form : null;
  return {
    legalForm: forma === "SL" || forma === "SLU" || forma === "SA" || forma === "AUTONOMO" ? forma : null,
    founders: typeof profile.number_of_founders === "number" ? profile.number_of_founders : 1,
    hasPremises: profile.physical_premises === true,
  };
}

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  // Se comprueba antes de leer el expediente: si no hay proveedor, no tiene
  // sentido cargar nada, y quien pregunta merece saberlo ya.
  if (!proveedorConfigurado()) {
    return NextResponse.json(
      {
        error: "AI_PROVIDER_NOT_CONFIGURED",
        message:
          "El razonamiento del orbe no está disponible: falta la clave del proveedor de IA. " +
          "El expediente sigue funcionando; puedes responder los datos desde el panel.",
      },
      { status: 503 },
    );
  }

  try {
    const proyecto = parsed.data.projectId
      ? await readProjectSnapshot(actor, parsed.data.projectId)
      : await readLatestProject(actor);

    if (!proyecto) {
      return NextResponse.json(
        {
          error: "NO_PROJECT",
          message: "Todavía no hay expediente. Cuéntame a qué se va a dedicar la empresa y lo abrimos.",
        },
        { status: 404 },
      );
    }

    const profile = proyecto.profile as Record<string, unknown>;
    const guardadas = await listTasks(actor, proyecto.id);
    const tareas = guardadas.length > 0 ? guardadas : await syncTasks(actor, proyecto.id);

    const porTarea = await readTaskDocuments(actor, proyecto.id);
    const documentos = Object.values(porTarea)
      .flat()
      .map((documento) => ({ category: documento.category, displayName: documento.displayName }));

    const inicio = typeof profile.activity_start_date === "string" ? profile.activity_start_date : undefined;
    const aprobacion = typeof profile.accounts_approval_date === "string" ? profile.accounts_approval_date : undefined;
    const hoy = new Date().toISOString().slice(0, 10);

    const contexto: ContextoDelExpediente = {
      profile,
      tareas,
      obligaciones: upcomingObligations({
        profile: perfilParaMotor(profile),
        from: hoy,
        horizonDays: 365,
        activityStart: inicio,
        accountsApproval: aprobacion,
      }),
      documentos,
      denominaciones: await readDenominations(actor, proyecto.id),
      hoy,
    };

    const respuesta = await consultarAsesor({
      texto: parsed.data.text,
      contexto,
      historial: parsed.data.historial,
      signal: AbortSignal.timeout(50_000),
    });

    return NextResponse.json({
      project: { id: proyecto.id, name: proyecto.name },
      ...respuesta,
      footer: INFORMATIONAL_FOOTER,
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof SinProveedorError) {
      return NextResponse.json({ error: "AI_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "AI_TIMEOUT", message: "El asesor ha tardado demasiado. Vuelve a intentarlo." },
        { status: 504 },
      );
    }
    if (error instanceof Error && error.message.startsWith("AI_HTTP_")) {
      return NextResponse.json(
        { error: error.message, message: "El proveedor de IA ha devuelto un error. Vuelve a intentarlo." },
        { status: 502 },
      );
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
