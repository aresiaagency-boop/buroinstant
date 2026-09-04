import { NextResponse } from "next/server";

import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { isEncryptionConfigured } from "@/lib/documents/encryption";
import { linkDocumentToTasks } from "@/lib/documents/evidence-repository";
import { listDocuments, storeDocument } from "@/lib/documents/repository";
import {
  CATEGORY_LABEL,
  MAX_DOCUMENT_BYTES,
  type DocumentCategory,
  requirementsFor,
  sanitizeFileName,
  validateUpload,
} from "@/lib/documents/validation";
import { readLatestProject } from "@/lib/project-profile";
import { checkEphemeralRateLimit } from "@/lib/security/rate-limit";
import { ProjectAccessError } from "@/lib/task-repository";

/**
 * Archivo de documentos del expediente.
 *
 * GET devuelve qué documentos pide el expediente, cuáles ya están y cuáles
 * faltan. POST guarda uno, cifrado.
 *
 * Reglas que no dependen de la interfaz:
 *   · Hace falta sesión real de Google. El modo demostración puede mirar, no
 *     guardar: un DNI no se sube desde una sesión que cualquiera puede abrir.
 *   · El tipo se decide por los bytes, no por lo que declare el navegador.
 *   · Nada de lo que se registra lleva el contenido del archivo.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function profileFor(profile: Record<string, unknown>) {
  const forma = typeof profile.preferred_legal_form === "string" ? profile.preferred_legal_form : null;
  return {
    legalForm: forma,
    hasPremises: profile.physical_premises === true,
    founders: typeof profile.number_of_founders === "number" ? profile.number_of_founders : 1,
  };
}

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED", documents: [] }, { status: 503 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) {
      return NextResponse.json({
        project: null,
        requirements: [],
        documents: [],
        encryptionReady: isEncryptionConfigured(),
        message: "Todavía no hay expediente. Responde el primer dato y te digo qué papeles hacen falta.",
      });
    }

    const documentos = await listDocuments(actor, project.id);
    const requisitos = requirementsFor(profileFor(project.profile as Record<string, unknown>));

    // Un requisito está cubierto si hay un documento en su categoría.
    const porCategoria = new Set(documentos.map((d) => d.category));

    return NextResponse.json({
      project: { id: project.id, name: project.name },
      encryptionReady: isEncryptionConfigured(),
      canUpload: actor.mode === "oauth",
      maxBytes: MAX_DOCUMENT_BYTES,
      requirements: requisitos.map((r) => ({
        ...r,
        categoryLabel: CATEGORY_LABEL[r.category],
        satisfied: porCategoria.has(r.category),
      })),
      documents: documentos,
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (actor.mode !== "oauth") {
    return NextResponse.json(
      {
        error: "GOOGLE_SESSION_REQUIRED",
        message:
          "El archivo guarda documentos personales. Entra con tu cuenta de Google para subir; en demostración sólo puedes mirar.",
      },
      { status: 403 },
    );
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isEncryptionConfigured()) {
    // Antes que guardar un DNI sin cifrar, no guardarlo.
    return NextResponse.json(
      {
        error: "ENCRYPTION_NOT_CONFIGURED",
        message: "El archivo no acepta documentos hasta que el cifrado esté configurado en el servidor.",
      },
      { status: 503 },
    );
  }

  const limite = checkEphemeralRateLimit(`documento:${actor.userId}`, {
    limit: 20,
    windowMs: 10 * 60 * 1_000,
  });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Demasiadas subidas seguidas. Espera unos minutos." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "BODY_INVALID", message: "No he podido leer el envío." }, { status: 400 });
  }

  const archivo = form.get("file");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "FILE_MISSING", message: "No venía ningún archivo." }, { status: 400 });
  }
  // Se corta antes de leerlo entero: no se gasta memoria en algo que se va a rechazar.
  if (archivo.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      {
        error: "DOCUMENT_TOO_LARGE",
        message: `El archivo supera los ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB.`,
      },
      { status: 413 },
    );
  }

  const category = String(form.get("category") ?? "OTHER");
  const requirementCode = form.get("requirementCode");
  const bytes = Buffer.from(await archivo.arrayBuffer());

  const validacion = validateUpload({ bytes, declaredName: archivo.name, category });
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error, message: validacion.message }, { status: 400 });
  }

  try {
    const project = await readLatestProject(actor);
    if (!project) {
      return NextResponse.json(
        {
          error: "PROJECT_REQUIRED",
          message: "Primero abre el expediente respondiendo un dato; después ya puedo guardar papeles en él.",
        },
        { status: 409 },
      );
    }

    const resultado = await storeDocument({
      actor,
      projectId: project.id,
      category: category as DocumentCategory,
      // El nombre se guarda saneado: el original es un dato del cliente.
      displayName: sanitizeFileName(archivo.name, validacion.type.extension) || `documento.${validacion.type.extension}`,
      mimeType: validacion.type.mime,
      requirementCode: typeof requirementCode === "string" && requirementCode.length <= 64 ? requirementCode : null,
      bytes,
    });

    // El papel no se queda en una carpeta: mueve el trámite al que responde.
    // Si eso falla, el documento ya está guardado y no se pierde.
    let effects: Awaited<ReturnType<typeof linkDocumentToTasks>> = [];
    try {
      effects = await linkDocumentToTasks({
        actor,
        projectId: project.id,
        document: {
          id: resultado.document.id,
          category: resultado.document.category,
          displayName: resultado.document.displayName,
          contentHash: resultado.document.contentHash,
        },
      });
    } catch {
      // Enlazar con el itinerario no puede tumbar la subida.
    }

    const movidos = effects.length;
    return NextResponse.json(
      {
        document: resultado.document,
        duplicated: resultado.duplicated,
        effects,
        message: resultado.duplicated
          ? "Ese documento ya estaba en el archivo; no lo he duplicado."
          : movidos === 0
            ? "Guardado y cifrado en tu expediente."
            : movidos === 1
              ? `Guardado y cifrado. Ha avanzado el trámite «${effects[0].taskTitle}».`
              : `Guardado y cifrado. Han avanzado ${movidos} trámites del itinerario.`,
      },
      { status: resultado.duplicated ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
