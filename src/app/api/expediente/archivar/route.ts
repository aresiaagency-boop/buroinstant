import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { LastOpenProjectError, listProjects, setProjectArchived } from "@/lib/project-profile";
import { ProjectAccessError } from "@/lib/task-repository";

/**
 * Archivar un expediente, o devolverlo.
 *
 * Existe por un caso concreto: un expediente abierto de más —por error, o un
 * ensayo que no se siguió— desplaza al verdadero en el panel, porque el panel
 * muestra el más reciente. Quien entra ve su trabajo perdido aunque siga ahí.
 *
 * Archivar no borra nada. El expediente conserva trámites, documentos y trazas;
 * sólo deja de contar como abierto. Y se puede devolver, porque quien archiva
 * por equivocación tiene que poder deshacerlo sin ayuda.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  projectId: z.string().uuid(),
  archivado: z.boolean(),
});

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    return NextResponse.json({ proyectos: await listProjects(actor) });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
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

  try {
    const project = await setProjectArchived({
      actor,
      projectId: parsed.data.projectId,
      archivado: parsed.data.archivado,
    });
    return NextResponse.json({ project, proyectos: await listProjects(actor) });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof LastOpenProjectError) {
      return NextResponse.json(
        {
          error: "LAST_OPEN_PROJECT",
          message:
            "Es tu único expediente abierto. Archivarlo dejaría el panel vacío, que es justo el susto que esto evita.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
