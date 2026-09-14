import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { readLatestProject, readProjectSnapshot } from "@/lib/project-profile";
import { ProjectAccessError } from "@/lib/task-repository";
import {
  DENOMINATION_STATUSES,
  DuplicateDenominationError,
  MAX_DENOMINACIONES,
  TooManyDenominationsError,
  TooManyGrantedError,
  plazosDe,
  readDenominations,
  saveDenominations,
} from "@/lib/tramites/denominations";

/**
 * Las denominaciones que se piden al Registro Mercantil Central.
 *
 * Vivían fuera del expediente, en un documento aparte, y la carpeta del trámite
 * salía sin ellas: se imprimía, se llegaba al RMC y había que buscarlas en otro
 * sitio. Ahora las guarda el expediente, con su orden y con cuál se concedió.
 *
 * La lista se repone entera en cada guardado: lo que importa es el orden
 * relativo, y mover la tercera al primer puesto es un cambio de la lista.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  projectId: z.string().uuid().optional(),
  denominaciones: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(200),
        status: z.enum(DENOMINATION_STATUSES).optional(),
      }),
    )
    .max(MAX_DENOMINACIONES),
});

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) return NextResponse.json({ project: null, denominaciones: [], plazos: null });

    const denominaciones = await readDenominations(actor, project.id);
    const expedida = project.profile.denomination_certified_at;
    return NextResponse.json({
      project: { id: project.id, name: project.name },
      denominaciones,
      maximo: MAX_DENOMINACIONES,
      plazos: plazosDe(typeof expedida === "string" ? expedida : null),
    });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function PUT(request: Request) {
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
    // Sin projectId, el del expediente abierto. Nunca se abre uno nuevo desde
    // aquí: guardar denominaciones no es empezar una empresa.
    const projectId = parsed.data.projectId ?? (await readLatestProject(actor))?.id;
    if (!projectId) return NextResponse.json({ error: "NO_PROJECT" }, { status: 404 });

    const denominaciones = await saveDenominations({
      actor,
      projectId,
      denominaciones: parsed.data.denominaciones,
    });

    const snapshot = await readProjectSnapshot(actor, projectId);
    const expedida = snapshot.profile.denomination_certified_at;
    return NextResponse.json({
      project: { id: snapshot.id, name: snapshot.name },
      denominaciones,
      plazos: plazosDe(typeof expedida === "string" ? expedida : null),
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof TooManyDenominationsError) {
      return NextResponse.json(
        { error: "TOO_MANY_DENOMINATIONS", message: `El Registro Mercantil Central admite ${MAX_DENOMINACIONES} por solicitud.` },
        { status: 400 },
      );
    }
    if (error instanceof DuplicateDenominationError) {
      return NextResponse.json(
        { error: "DUPLICATE_DENOMINATION", message: "Hay dos denominaciones repetidas en la lista." },
        { status: 400 },
      );
    }
    if (error instanceof TooManyGrantedError) {
      return NextResponse.json(
        { error: "TOO_MANY_GRANTED", message: "Sólo puede haber una denominación concedida." },
        { status: 400 },
      );
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
