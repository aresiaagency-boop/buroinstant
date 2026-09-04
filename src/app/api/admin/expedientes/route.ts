import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentActor, isSuperAdmin } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { deleteProject, readProjectDossier } from "@/lib/admin-repository";

/**
 * Control de expedientes desde el panel de superadministración.
 *
 * GET abre un expediente entero sin entrar en la cuenta de nadie: datos,
 * trámites, documentos (metadatos, nunca el contenido descifrado) y traza.
 *
 * DELETE lo borra. Es irreversible y arrastra documentos y trámites, así que
 * exige escribir el nombre exacto del expediente: un botón no debería poder
 * destruir el trabajo de una persona por un clic mal dado.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  projectId: z.string().uuid(),
  confirmationName: z.string().trim().min(1).max(300),
});

async function guard() {
  const actor = await getCurrentActor();
  if (!actor || !isSuperAdmin(actor)) return null;
  if (!isDatabaseConfigured()) return null;
  return actor;
}

export async function GET(request: Request) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  }

  try {
    const dossier = await readProjectDossier(id);
    if (!dossier) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json(dossier);
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 422 });

  try {
    const result = await deleteProject({ ...parsed.data, actorEmail: actor.email });
    return NextResponse.json({
      deleted: result.name,
      documents: result.documents,
      message: `Expediente «${result.name}» borrado, con sus ${result.documents} documentos.`,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    if (mensaje === "PROJECT_NOT_FOUND") {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    if (mensaje === "CONFIRMATION_MISMATCH") {
      return NextResponse.json(
        {
          error: "CONFIRMATION_MISMATCH",
          message: "El nombre no coincide. Escríbelo exactamente como aparece para poder borrarlo.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
