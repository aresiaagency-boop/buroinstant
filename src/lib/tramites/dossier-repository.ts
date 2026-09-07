import { readTaskDocuments } from "@/lib/documents/evidence-repository";
import { readProjectSnapshot } from "@/lib/project-profile";
import { ProjectAccessError, listTasks, syncTasks } from "@/lib/task-repository";
import { buildCarpeta, siguientePaso, type Carpeta } from "@/lib/tramites/dossier";
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

  const carpeta = buildCarpeta({ task, itinerario, profile: snapshot.profile, documentos });

  return {
    ...carpeta,
    proyecto: { id: snapshot.id, name: snapshot.name },
    siguientePaso: siguientePaso(carpeta),
    generadaEn: new Date().toISOString(),
  };
}

export { ProjectAccessError };
