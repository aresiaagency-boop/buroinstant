import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { canConfirm } from "@/lib/documents/evidence";
import {
  NoEvidenceAttachedError,
  confirmTaskWithEvidence,
  readTaskDocuments,
} from "@/lib/documents/evidence-repository";
import { readLatestProject } from "@/lib/project-profile";
import { EvidenceRequiredError, ProjectAccessError, listTasks, syncTasks } from "@/lib/task-repository";

/**
 * El itinerario con su evidencia.
 *
 * GET devuelve cada trámite del expediente con los documentos que lo acreditan
 * y si ya puede darse por hecho.
 *
 * PATCH lo da por hecho, pero sólo si hay un documento aportado: un trámite no
 * se cierra sobre la palabra de nadie, ni siquiera la de quien lo pide.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  taskCode: z.string().trim().min(2).max(64),
  documentId: z.string().uuid().optional(),
});

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED", tasks: [] }, { status: 503 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) {
      return NextResponse.json({
        project: null,
        tasks: [],
        message: "Todavía no hay expediente. Responde el primer dato y el itinerario se construye solo.",
      });
    }

    const existentes = await listTasks(actor, project.id);
    const tareas = existentes.length > 0 ? existentes : await syncTasks(actor, project.id);
    const documentos = await readTaskDocuments(actor, project.id);

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      canConfirm: actor.mode === "oauth",
      tasks: tareas.map((task) => {
        const aportados = documentos[task.code] ?? [];
        return {
          ...task,
          documents: aportados,
          confirmable: canConfirm(task, aportados.length),
        };
      }),
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (actor.mode !== "oauth") {
    return NextResponse.json(
      {
        error: "GOOGLE_SESSION_REQUIRED",
        message:
          "Dar un trámite por hecho queda registrado en el expediente. Entra con tu cuenta de Google; en demostración sólo puedes mirar.",
      },
      { status: 403 },
    );
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  let cuerpo: z.infer<typeof patchSchema>;
  try {
    cuerpo = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "BODY_INVALID" }, { status: 400 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });

    const { evidence } = await confirmTaskWithEvidence({
      actor,
      projectId: project.id,
      taskCode: cuerpo.taskCode,
      documentId: cuerpo.documentId,
    });

    return NextResponse.json({ evidence, message: "Trámite dado por hecho, con el documento como prueba." });
  } catch (error) {
    if (error instanceof NoEvidenceAttachedError || error instanceof EvidenceRequiredError) {
      return NextResponse.json(
        {
          error: "NO_EVIDENCE_ATTACHED",
          message:
            "Ese trámite no tiene ningún documento aportado. Sube primero el papel que lo acredita y entonces puedo darlo por hecho.",
        },
        { status: 409 },
      );
    }
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "TASK_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
