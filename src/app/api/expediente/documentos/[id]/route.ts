import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { DecryptionFailedError, EncryptionNotConfiguredError } from "@/lib/documents/encryption";
import { readDocument } from "@/lib/documents/repository";
import { readLatestProject } from "@/lib/project-profile";
import { checkEphemeralRateLimit } from "@/lib/security/rate-limit";
import { ProjectAccessError } from "@/lib/task-repository";

/**
 * Descarga de un documento del archivo.
 *
 * El contenido se descifra al vuelo y se entrega como adjunto. Nunca se sirve
 * en línea: un PDF o un SVG mostrados dentro del dominio pueden ejecutar cosas
 * en el contexto de la sesión, así que todo baja como descarga y con la
 * política de contenido cerrada.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const limite = checkEphemeralRateLimit(`documento-descarga:${actor.userId}`, {
    limit: 60,
    windowMs: 10 * 60 * 1_000,
  });
  if (!limite.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });

    const documento = await readDocument(actor, project.id, id);

    // El nombre ya viene saneado desde la subida; se codifica igualmente para
    // que ninguna tilde rompa la cabecera.
    const nombre = encodeURIComponent(documento.displayName);
    return new NextResponse(new Uint8Array(documento.bytes), {
      status: 200,
      headers: {
        "Content-Type": documento.mimeType,
        "Content-Length": String(documento.bytes.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${nombre}`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        // Un documento personal no se guarda en ninguna caché intermedia.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof DecryptionFailedError) {
      // No se distingue clave equivocada de contenido alterado.
      return NextResponse.json(
        {
          error: "DOCUMENT_UNREADABLE",
          message: "No he podido abrir ese documento. Vuelve a subirlo y avisa si se repite.",
        },
        { status: 422 },
      );
    }
    if (error instanceof EncryptionNotConfiguredError) {
      return NextResponse.json({ error: "ENCRYPTION_NOT_CONFIGURED" }, { status: 503 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
