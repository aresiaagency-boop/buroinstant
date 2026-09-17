import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { readLatestProject } from "@/lib/project-profile";
import { ProjectAccessError, updateTaskStatus } from "@/lib/task-repository";

/**
 * Mover un trámite por el itinerario, sin cerrarlo.
 *
 * El expediente ya sabía dar un trámite por hecho —con su documento delante,
 * en `PATCH /api/expediente/tramites`— y no sabía hacer nada más. Entre «no
 * empezado» y «hecho» está casi todo el proceso real: la cita pedida, el
 * escrito presentado y esperando a que conteste la administración, el paso
 * atascado porque falta otra cosa. Nada de eso se podía anotar, así que el
 * itinerario mentía: todo parecía parado.
 *
 * Aquí se anota. Y sólo eso: `COMPLETED` NO se admite por esta puerta. Cerrar
 * un trámite exige una evidencia, esa regla vive en `confirmTaskWithEvidence`
 * y no se duplica aquí, porque una regla en dos sitios es una regla que un día
 * se cumple en uno solo.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESTADOS = ["IN_PROGRESS", "WAITING_AUTHORITY", "BLOCKED", "NOT_APPLICABLE"] as const;

const patchSchema = z.object({
  taskCode: z.string().trim().min(2).max(64),
  status: z.enum(ESTADOS),
  nota: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (actor.mode !== "oauth") {
    return NextResponse.json(
      {
        error: "GOOGLE_SESSION_REQUIRED",
        message:
          "Mover un trámite queda registrado en el expediente. Entra con tu cuenta de Google; en demostración sólo puedes mirar.",
      },
      { status: 403 },
    );
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BODY_INVALID" }, { status: 400 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });

    const { previousStatus } = await updateTaskStatus({
      actor,
      projectId: project.id,
      code: parsed.data.taskCode,
      status: parsed.data.status,
      // La nota no es evidencia y no se guarda como tal: `updateTaskStatus`
      // sólo acepta `evidence` para cerrar, y cerrar no se hace desde aquí.
    });

    return NextResponse.json({
      taskCode: parsed.data.taskCode,
      from: previousStatus,
      to: parsed.data.status,
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
