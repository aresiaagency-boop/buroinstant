import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { readLatestProject, readPendingProposals, saveProjectProfile } from "@/lib/project-profile";
import { ProjectAccessError, reconcileTasks } from "@/lib/task-repository";

/**
 * El expediente del panel.
 *
 * GET devuelve el expediente abierto más reciente de quien pregunta, para que
 * al entrar se recupere lo ya respondido en lugar de empezar de cero.
 *
 * PATCH guarda un dato. Si todavía no hay expediente, lo crea: responder la
 * primera pregunta ya deja constancia.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    business_description: z.string().trim().min(3).max(3_000).optional(),
    preferred_legal_form: z.enum(["SL", "SLU", "AUTONOMO", "SIN_DECIDIR"]).optional(),
    number_of_founders: z.number().int().min(1).max(20).optional(),
    municipality: z.string().trim().min(2).max(160).optional(),
    physical_premises: z.boolean().optional(),
    // La fecha que declara el 036. Marca desde cuándo corren los plazos, así
    // que el calendario deja de ofrecer vencimientos anteriores a la empresa.
    activity_start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD")
      .nullable()
      .optional(),
    // La fecha en que la junta aprobó las cuentas. De ella cuelga el plazo de
    // depósito en el Registro; sin ella sólo puede mostrarse el límite legal.
    accounts_approval_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD")
      .nullable()
      .optional(),
    // Fecha de expedición de la certificación negativa del RMC. De ella cuelgan
    // los tres meses para otorgar escritura y los seis de reserva.
    denomination_certified_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD")
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.activity_start_date !== undefined ||
      value.accounts_approval_date !== undefined ||
      value.denomination_certified_at !== undefined ||
      value.business_description !== undefined ||
      value.preferred_legal_form !== undefined ||
      value.number_of_founders !== undefined ||
      value.municipality !== undefined ||
      value.physical_premises !== undefined,
    { message: "NOTHING_TO_SAVE" },
  );

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED", project: null }, { status: 503 });
  }
  try {
    const project = await readLatestProject(actor);
    const proposals = project ? await readPendingProposals(project.id, project.profile) : [];
    return NextResponse.json({ project, proposals });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, preferred_legal_form: forma, ...resto } = parsed.data;
  try {
    const project = await saveProjectProfile({
      actor,
      projectId,
      patch: {
        ...resto,
        // "Todavía no lo sé" es una respuesta legítima: se guarda como sin decidir.
        ...(forma !== undefined ? { preferred_legal_form: forma === "SIN_DECIDIR" ? null : forma } : {}),
      },
    });
    // El perfil acaba de cambiar: el itinerario tiene que cambiar con él. Sin
    // esto quedaba congelado con el perfil de la primera vez —comprobado en un
    // expediente real: con el local corregido a «no», la licencia de actividad
    // municipal seguía en la lista—. Si la reconciliación falla, el dato queda
    // guardado igual: perder el cambio de perfil sería peor.
    let itinerario: Awaited<ReturnType<typeof reconcileTasks>> | null = null;
    try {
      itinerario = await reconcileTasks(actor, project.id);
    } catch {
      itinerario = null;
    }

    return NextResponse.json({ project, itinerario, orbEvent: "DATA_APPLIED" });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
