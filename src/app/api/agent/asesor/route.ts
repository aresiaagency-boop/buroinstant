import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentActor } from "@/lib/auth";
import { db, isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
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
  elegirProveedor,
  queHacerConEsto,
  modelosAProbar,
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

/**
 * Lo último que pasó en el expediente.
 *
 * Sólo el tipo de evento y cuándo: el payload puede traer datos de la persona y
 * no hace falta metérselos al modelo para que sepa que hubo un cambio de
 * perfil o una subida de documento.
 */
async function leerHistorial(projectId: string): Promise<Array<{ cuando: string; que: string }>> {
  const sql = db();
  const filas = await sql<Array<{ event_type: string; created_at: Date }>>`
    select event_type, created_at
    from case_events
    where project_id = ${projectId}
    order by created_at desc
    limit 15
  `;
  return filas.map((fila) => ({
    cuando: fila.created_at.toISOString().slice(0, 16).replace("T", " "),
    que: fila.event_type,
  }));
}

function perfilParaMotor(profile: Record<string, unknown>): Partial<ProjectProfile> {
  const forma = typeof profile.preferred_legal_form === "string" ? profile.preferred_legal_form : null;
  return {
    legalForm: forma === "SL" || forma === "SLU" || forma === "SA" || forma === "AUTONOMO" ? forma : null,
    founders: typeof profile.number_of_founders === "number" ? profile.number_of_founders : 1,
    hasPremises: profile.physical_premises === true,
  };
}

/**
 * Diagnóstico del asesor.
 *
 * Existe porque el orbe falló en producción y lo único que se veía era «No he
 * podido procesar esta entrada». Un mensaje genérico convierte un fallo de
 * configuración en un misterio. Esto contesta en una línea qué proveedor hay,
 * qué modelo respondió y, si ninguno, con qué código falló cada uno.
 *
 * No devuelve ninguna clave ni parte de ella: sólo si está y qué contestó.
 */
export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });

  const elegido = elegirProveedor();
  if (!elegido) {
    return NextResponse.json({
      proveedor: null,
      diagnostico: "No hay ninguna clave de proveedor configurada en el servidor.",
      claves: {
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      },
    });
  }

  try {
    const prueba = await consultarAsesor({
      texto: "Responde exactamente: listo.",
      contexto: {
        profile: {},
        tareas: [],
        obligaciones: [],
        documentos: [],
        documentosPorTramite: {},
        denominaciones: [],
        historial: [],
        hoy: new Date().toISOString().slice(0, 10),
      },
      signal: AbortSignal.timeout(30_000),
    });
    return NextResponse.json({
      proveedor: prueba.proveedor,
      modelo: prueba.modelo,
      // Que la cuenta admita la herramienta de búsqueda no es lo mismo que
      // que el asesor haya buscado para contestar «listo». Se informa de lo
      // primero, que es lo que dice qué puede prometer.
      busquedaWeb: prueba.busquedaDisponible ? "disponible" : "no disponible en esta cuenta",
      diagnostico: prueba.busquedaDisponible
        ? "El asesor responde y puede buscar en la web."
        : "El asesor responde, pero sin búsqueda web: contesta con el expediente y los hechos verificados.",
      respuestaDePrueba: prueba.texto.slice(0, 200),
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      proveedor: elegido.proveedor,
      modelosProbados: elegido.proveedor === "anthropic" ? modelosAProbar() : undefined,
      diagnostico: "El asesor NO responde.",
      // Un diagnóstico que no termina en una acción concreta es media
      // herramienta: el mensaje de la API es correcto y no dice dónde pulsar.
      queHacer: queHacerConEsto(mensaje) ?? "Revisa el error de abajo: lo devuelve el proveedor tal cual.",
      // El mensaje lleva el código HTTP y el motivo de cada modelo probado, que
      // es lo que dice si el problema es la clave, la cuota o el cuerpo.
      error: mensaje,
    });
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
    // El mismo dato, pero sin perder a qué trámite está aportado cada papel:
    // es lo único que autoriza a proponer cerrarlo.
    const documentosPorTramite = Object.fromEntries(
      Object.entries(porTarea).map(([code, docs]) => [code, docs.map((doc) => doc.displayName)]),
    );

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
      documentosPorTramite,
      denominaciones: await readDenominations(actor, proyecto.id),
      // Sin esto el asesor contesta y se olvida. Con esto puede sacar por su
      // cuenta lo que quedó empezado y sin cerrar, que es la mitad del trabajo
      // de un gestor: acordarse por ti.
      historial: await leerHistorial(proyecto.id),
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
      // El mismo motivo accionable que el diagnóstico, para que quien está en
      // el panel no tenga que abrir otra pestaña para enterarse.
      return NextResponse.json(
        {
          error: error.message,
          message:
            queHacerConEsto(error.message) ??
            "El proveedor de IA ha devuelto un error. Diagnóstico en /api/agent/asesor.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
