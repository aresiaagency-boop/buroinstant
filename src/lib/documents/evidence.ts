import type { DocumentCategory } from "@/lib/documents/validation";
import type { DerivedTask, TaskStatus } from "@/lib/task-engine";

/**
 * De un documento subido al itinerario.
 *
 * Subir la escritura debería mover el trámite de la escritura. Pero hay una
 * línea que este módulo no cruza: **un documento no da por hecho un trámite**.
 * La categoría la elige la persona en un desplegable; un PDF mal clasificado
 * cerraría por su cuenta un paso ante notaría o ante el Registro.
 *
 * Así que el documento avanza el trámite y aporta la evidencia, y hace falta
 * una confirmación explícita para darlo por hecho. Dos reglas del proyecto se
 * cumplen a la vez: no marcar trámites como realizados sin evidencia, y no
 * automatizar como irreversible lo que no lo es.
 */

export type EvidenceEffect = {
  /** Código del trámite que este documento toca. */
  taskCode: string;
  taskTitle: string;
  /** Estado al que pasa por haber recibido el documento. Nunca COMPLETED. */
  nextStatus: TaskStatus;
  /** Estado en el que estaba, para poder explicar el movimiento. */
  previousStatus: TaskStatus;
  /** Qué falta para darlo por hecho, en palabras de quien crea la empresa. */
  confirmationPrompt: string;
  /** Si ya se puede dar por hecho con sólo confirmar. */
  readyToConfirm: boolean;
};

export type EvidenceDocument = {
  id: string;
  category: DocumentCategory;
  displayName: string;
  contentHash: string;
};

/**
 * Estados que un documento no debe tocar. Un trámite ya hecho no se reabre
 * porque llegue otro papel, y uno que no aplica no empieza a aplicar solo.
 */
const INTOCABLES: TaskStatus[] = ["COMPLETED", "NOT_APPLICABLE"];

/**
 * Trámites cuya prueba es un acto de un tercero, no el papel que aporta la
 * persona. Aquí el documento acredita que se ha presentado, no que esté
 * resuelto: el trámite queda esperando a la Administración.
 */
const ESPERAN_A_LA_ADMINISTRACION = new Set([
  "REGISTRY",
  "NIF_PROVISIONAL",
  "NIF_DEFINITIVO",
  "SS_INSCRIPCION",
  "RETA",
  "LOCAL_LICENCIA",
  "ACTIVIDAD_REGULADA",
  "LIBROS_LEGALIZACION",
]);

/** Qué le pasa al itinerario cuando entra un documento. */
export function effectsOf(document: EvidenceDocument, tasks: DerivedTask[]): EvidenceEffect[] {
  const efectos: EvidenceEffect[] = [];

  for (const task of tasks) {
    if (!task.requiredDocuments.includes(document.category)) continue;
    if (INTOCABLES.includes(task.status)) continue;

    const esperaTercero = ESPERAN_A_LA_ADMINISTRACION.has(task.code);
    efectos.push({
      taskCode: task.code,
      taskTitle: task.title,
      previousStatus: task.status,
      nextStatus: esperaTercero ? "WAITING_AUTHORITY" : "IN_PROGRESS",
      readyToConfirm: !esperaTercero,
      confirmationPrompt: esperaTercero
        ? `Has aportado el justificante. Cuando ${task.authority} resuelva, confírmalo y el trámite queda cerrado con este documento como prueba.`
        : `Confirma que «${document.displayName}» es ${task.verificationMethod.toLowerCase().replace(/\.$/, "")} y doy el trámite por hecho.`,
    });
  }

  return efectos;
}

/**
 * La línea de evidencia que se guarda al dar un trámite por hecho. Identifica
 * el documento sin repetir su contenido, y deja la huella para poder demostrar
 * después que es ese y no otro.
 */
export function evidenceLine(document: EvidenceDocument, confirmedAt: Date): string {
  const fecha = confirmedAt.toISOString().slice(0, 10);
  return `Documento «${document.displayName}» · sha256 ${document.contentHash.slice(0, 16)}… · confirmado por la persona titular el ${fecha}`;
}

/**
 * Un trámite sin documento aportado no puede confirmarse: sería marcarlo hecho
 * sin evidencia. La comprobación vive aquí para que la interfaz no sea la única
 * que la hace.
 */
export function canConfirm(task: Pick<DerivedTask, "status">, documentosAportados: number): boolean {
  if (task.status === "COMPLETED" || task.status === "NOT_APPLICABLE") return false;
  return documentosAportados > 0;
}
