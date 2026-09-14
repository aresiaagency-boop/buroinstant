import { readTaskDocuments } from "@/lib/documents/evidence-repository";
import { readProjectSnapshot } from "@/lib/project-profile";
import type { DerivedTask } from "@/lib/task-engine";
import { ProjectAccessError, listTasks, syncTasks } from "@/lib/task-repository";
import { plazosDe, readDenominations } from "@/lib/tramites/denominations";
import {
  buildCarpeta,
  siguientePaso,
  type ApartadoDeCarpeta,
  type Carpeta,
  type HuecoDeCarpeta,
} from "@/lib/tramites/dossier";
import type { Actor } from "@/types/domain";

/**
 * Arma la carpeta con lo que hay guardado de verdad.
 *
 * Todo lo que lee pasa antes por `assertProjectAccess` —dentro de `listTasks`,
 * `readProjectSnapshot` y `readTaskDocuments`—, así que un expediente ajeno
 * responde lo mismo que uno inexistente.
 */

export class TramiteNotFoundError extends Error {
  constructor() {
    super("TRAMITE_NOT_FOUND");
    this.name = "TramiteNotFoundError";
  }
}

export type CarpetaCompleta = Carpeta & {
  proyecto: { id: string; name: string };
  siguientePaso: string;
  generadaEn: string;
};

export async function readCarpeta(input: {
  actor: Actor;
  projectId: string;
  taskCode: string;
}): Promise<CarpetaCompleta> {
  const snapshot = await readProjectSnapshot(input.actor, input.projectId);

  const guardadas = await listTasks(input.actor, input.projectId);
  const itinerario = guardadas.length > 0 ? guardadas : await syncTasks(input.actor, input.projectId);

  const task = itinerario.find((tarea) => tarea.code === input.taskCode);
  // Un código que no está en ESTE itinerario no existe para esta persona: no
  // se distingue de uno inventado, y así no se filtra qué trámites hay.
  if (!task) throw new TramiteNotFoundError();

  const porTarea = await readTaskDocuments(input.actor, input.projectId);
  const documentos = (porTarea[task.code] ?? []).map((documento) => ({
    id: documento.id,
    category: documento.category,
    displayName: documento.displayName,
  }));

  const extra = await apartadosDe({ actor: input.actor, projectId: input.projectId, task, snapshot });

  const carpeta = buildCarpeta({
    task,
    itinerario,
    profile: snapshot.profile,
    documentos,
    apartados: extra.apartados,
    huecosExtra: extra.huecos,
  });

  return {
    ...carpeta,
    proyecto: { id: snapshot.id, name: snapshot.name },
    siguientePaso: siguientePaso(carpeta),
    generadaEn: new Date().toISOString(),
  };
}

/**
 * Los bloques propios de cada trámite.
 *
 * Hoy sólo la denominación los tiene. Se arma aquí y no en `buildCarpeta`
 * porque exige leer de la base de datos, y `buildCarpeta` es puro a propósito:
 * así se puede probar la carpeta entera sin PostgreSQL.
 */
async function apartadosDe(input: {
  actor: Actor;
  projectId: string;
  task: DerivedTask;
  snapshot: { profile: Record<string, unknown> };
}): Promise<{ apartados: ApartadoDeCarpeta[]; huecos: HuecoDeCarpeta[] }> {
  if (input.task.code !== "COMPANY_NAME") return { apartados: [], huecos: [] };

  const denominaciones = await readDenominations(input.actor, input.projectId);

  if (denominaciones.length === 0) {
    // Sin nombres no hay nada que pedir. Es un hueco del trámite, no un detalle.
    return {
      apartados: [],
      huecos: [
        {
          campo: "preferred_legal_form",
          etiqueta: "Denominaciones a solicitar",
          comoSeConsigue:
            "Escribe hasta cinco denominaciones por orden de preferencia en el expediente. " +
            "El Registro Mercantil Central concede la primera que esté libre.",
        },
      ],
    };
  }

  const ETIQUETA: Record<string, string> = {
    PROPOSED: "por solicitar",
    GRANTED: "CONCEDIDA",
    REJECTED: "ocupada",
  };

  const apartados: ApartadoDeCarpeta[] = [
    {
      titulo: "Denominaciones a solicitar, por orden de preferencia",
      lineas: denominaciones.map((item) => `${item.position}. ${item.name} — ${ETIQUETA[item.status]}`),
      nota:
        "Se piden en una sola solicitud, hasta cinco. El Registro concede la primera libre. " +
        "Las reglas de composición las aplica el RMC: aquí van tal y como las escribiste.",
    },
  ];

  const expedida = input.snapshot.profile.denomination_certified_at;
  const plazos = plazosDe(typeof expedida === "string" ? expedida : null);
  if (plazos) {
    apartados.push({
      titulo: "Plazos que corren desde la certificación",
      lineas: [
        `Expedida el ${plazos.expedidaEl}.`,
        `Otorgar la escritura, hasta el ${plazos.limiteEscritura} (tres meses).`,
        `Reserva de la denominación, hasta el ${plazos.limiteReserva} (seis meses).`,
      ],
      nota:
        "No basta con firmar dentro de plazo: la certificación tiene que seguir vigente cuando la " +
        "escritura se PRESENTA en el Registro. Una resolución de la Dirección General de Seguridad " +
        "Jurídica y Fe Pública de 29 de abril de 2026 rechazó una inscripción por presentarla con la " +
        "certificación ya caducada.",
    });
  } else {
    apartados.push({
      titulo: "Plazos que corren desde la certificación",
      lineas: [
        "Todavía no consta la fecha de expedición, así que no se puede calcular ningún plazo.",
        "Anótala en el expediente en cuanto la tengas: de ella cuelgan los tres meses para firmar y los seis de reserva.",
      ],
    });
  }

  return { apartados, huecos: [] };
}

export { ProjectAccessError };
