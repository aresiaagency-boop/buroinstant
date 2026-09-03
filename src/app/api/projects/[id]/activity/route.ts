import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { classifyProjectActivity } from "@/lib/activity-repository";
import { ProjectAccessError } from "@/lib/task-repository";

/**
 * Clasificación de la actividad del proyecto.
 *
 * Devuelve el sector reconocido, las señales del negocio y la lista de lo que
 * hay que comprobar en sede oficial. Nunca devuelve un epígrafe de IAE ni un
 * código CNAE: eso se consulta y se confirma, no se deduce.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const { id } = await context.params;
  try {
    const classification = await classifyProjectActivity(actor, id);
    return NextResponse.json({
      ...classification,
      orbEvent: classification.sector === "SIN_DETERMINAR" ? "NO_VERIFIED_SOURCE" : "ACTIVITY_CLASSIFIED",
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
