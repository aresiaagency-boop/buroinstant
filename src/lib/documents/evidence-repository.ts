import { db } from "@/lib/db";
import type { Actor } from "@/types/domain";
import {
  canConfirm,
  effectsOf,
  evidenceLine,
  type EvidenceDocument,
  type EvidenceEffect,
} from "@/lib/documents/evidence";
import { CATEGORY_LABEL, type DocumentCategory } from "@/lib/documents/validation";
import { assertProjectAccess, listTasks, syncTasks, updateTaskStatus } from "@/lib/task-repository";
import { ProjectAccessError } from "@/lib/task-repository";

/**
 * El vínculo entre el archivo y el itinerario.
 *
 * Al entrar un documento se anota de qué trámites es prueba y se mueven esos
 * trámites. Ninguno se da por hecho aquí: eso exige que la persona lo confirme,
 * y la confirmación se guarda con el nombre y la huella del documento, de modo
 * que después pueda demostrarse con cuál se cerró.
 */

export type LinkedDocument = {
  id: string;
  displayName: string;
  category: DocumentCategory;
  categoryLabel: string;
  contentHash: string;
  sizeBytes: number;
};

/**
 * Anota el documento como prueba de los trámites que le corresponden y avanza
 * esos trámites. Devuelve qué se movió, para poder decírselo a la persona.
 */
export async function linkDocumentToTasks(input: {
  actor: Actor;
  projectId: string;
  document: EvidenceDocument;
}): Promise<EvidenceEffect[]> {
  const { userId, workspaceId } = await assertProjectAccess(input.actor, input.projectId);

  // Si el itinerario todavía no existe, se construye: subir un papel antes de
  // haber abierto el itinerario no puede perder la conexión.
  const existentes = await listTasks(input.actor, input.projectId);
  const tareas = existentes.length > 0 ? existentes : await syncTasks(input.actor, input.projectId);

  const efectos = effectsOf(input.document, tareas);
  if (efectos.length === 0) return [];

  const sql = db();
  for (const efecto of efectos) {
    await sql`
      insert into task_documents (workspace_id, project_id, task_code, document_id, created_by)
      values (${workspaceId}, ${input.projectId}, ${efecto.taskCode}, ${input.document.id}, ${userId})
      on conflict (project_id, task_code, document_id) do nothing
    `;
    // El estado se mueve, pero nunca a COMPLETED: eso lo decide la persona.
    await sql`
      update tasks
      set status = ${efecto.nextStatus}, updated_at = now()
      where project_id = ${input.projectId} and code = ${efecto.taskCode}
    `;
  }

  await sql`
    insert into case_events (workspace_id, project_id, event_type, payload, created_by)
    values (${workspaceId}, ${input.projectId}, 'TASK_EVIDENCE_ATTACHED', ${sql.json({
      documentId: input.document.id,
      contentHash: input.document.contentHash,
      taskCodes: efectos.map((e) => e.taskCode),
    })}, ${userId})
  `;

  return efectos;
}

/** Documentos aportados a cada trámite, para pintarlos junto al paso. */
export async function readTaskDocuments(
  actor: Actor,
  projectId: string,
): Promise<Record<string, LinkedDocument[]>> {
  await assertProjectAccess(actor, projectId);
  const sql = db();
  const filas = await sql<
    Array<{
      task_code: string;
      id: string;
      display_name: string;
      category: string;
      content_hash: string | null;
      size_bytes: string | number;
    }>
  >`
    select l.task_code, d.id, d.display_name, d.category, d.content_hash, d.size_bytes
    from task_documents l
    join documents d on d.id = l.document_id
    where l.project_id = ${projectId}
    order by l.created_at asc
  `;

  const salida: Record<string, LinkedDocument[]> = {};
  for (const fila of filas) {
    const category = fila.category as DocumentCategory;
    (salida[fila.task_code] ??= []).push({
      id: fila.id,
      displayName: fila.display_name,
      category,
      categoryLabel: CATEGORY_LABEL[category] ?? category,
      contentHash: fila.content_hash ?? "",
      sizeBytes: Number(fila.size_bytes),
    });
  }
  return salida;
}

export class NoEvidenceAttachedError extends Error {
  constructor() {
    super("NO_EVIDENCE_ATTACHED");
    this.name = "NoEvidenceAttachedError";
  }
}

/**
 * Da un trámite por hecho, apoyándose en el documento aportado. Sin documento
 * no se puede: sería marcarlo hecho sin evidencia, que es justo lo que este
 * expediente no debe permitir.
 */
export async function confirmTaskWithEvidence(input: {
  actor: Actor;
  projectId: string;
  taskCode: string;
  documentId?: string;
}): Promise<{ evidence: string }> {
  await assertProjectAccess(input.actor, input.projectId);

  const tareas = await listTasks(input.actor, input.projectId);
  const tarea = tareas.find((t) => t.code === input.taskCode);
  if (!tarea) throw new ProjectAccessError();

  const porTarea = await readTaskDocuments(input.actor, input.projectId);
  const aportados = porTarea[input.taskCode] ?? [];
  if (!canConfirm(tarea, aportados.length)) throw new NoEvidenceAttachedError();

  const elegido = input.documentId
    ? aportados.find((d) => d.id === input.documentId)
    : aportados[aportados.length - 1];
  if (!elegido) throw new NoEvidenceAttachedError();

  const linea = evidenceLine(
    {
      id: elegido.id,
      category: elegido.category,
      displayName: elegido.displayName,
      contentHash: elegido.contentHash,
    },
    new Date(),
  );

  // La regla de «no hay hecho sin evidencia» vive en updateTaskStatus; aquí se
  // le entrega la evidencia real en lugar de un texto escrito a mano.
  await updateTaskStatus({
    actor: input.actor,
    projectId: input.projectId,
    code: input.taskCode,
    status: "COMPLETED",
    evidence: linea,
  });

  return { evidence: linea };
}
