import type { DerivedTask } from "@/lib/task-engine";

/**
 * «¿Qué me falta?»
 *
 * Reparte el itinerario en cinco cajones y devuelve UNA pregunta prioritaria.
 * Un paso sólo cuenta como completado si tiene evidencia: el progreso mide
 * trabajo acreditado, no optimismo.
 */

export type Bucket = "BLOQUEADOR" | "OBLIGATORIO" | "RECOMENDADO" | "OPCIONAL" | "COMPLETADO";

export type CompletenessItem = {
  code: string;
  label: string;
  detail: string;
  bucket: Bucket;
  reason: string;
  authority?: string;
  sourceUrl?: string;
};

export type FieldGap = { field: string; label: string; blocking: boolean };

export type CompletenessReport = {
  items: CompletenessItem[];
  buckets: Record<Bucket, CompletenessItem[]>;
  percentComplete: number;
  blockedCount: number;
  nextBestAction: CompletenessItem | null;
  nextQuestion: string | null;
};

const EMPTY_BUCKETS = (): Record<Bucket, CompletenessItem[]> => ({
  BLOQUEADOR: [],
  OBLIGATORIO: [],
  RECOMENDADO: [],
  OPCIONAL: [],
  COMPLETADO: [],
});

export function buildCompleteness(tasks: DerivedTask[], gaps: FieldGap[] = []): CompletenessReport {
  const items: CompletenessItem[] = [];

  for (const gap of gaps) {
    items.push({
      code: `FIELD_${gap.field.toUpperCase()}`,
      label: gap.label,
      detail: "Dato necesario para continuar el expediente.",
      bucket: gap.blocking ? "BLOQUEADOR" : "RECOMENDADO",
      reason: gap.blocking
        ? "Sin este dato no se puede determinar el itinerario correcto."
        : "Mejora la precisión del diagnóstico, pero no detiene el expediente.",
    });
  }

  for (const task of tasks) {
    const base = {
      code: task.code,
      label: task.title,
      detail: task.detail,
      authority: task.authority,
      sourceUrl: task.sourceUrl,
    };

    if (task.status === "COMPLETED") {
      items.push({ ...base, bucket: "COMPLETADO", reason: `Acreditado por: ${task.verificationMethod}` });
      continue;
    }
    if (task.status === "NOT_APPLICABLE") continue;
    if (task.status === "BLOCKED") {
      items.push({ ...base, bucket: "BLOQUEADOR", reason: "La tarea está bloqueada y detiene el itinerario." });
      continue;
    }
    if (task.pendingVerification) {
      items.push({
        ...base,
        bucket: "RECOMENDADO",
        reason: `Pendiente de verificación oficial: ${task.pendingVerification}`,
      });
      continue;
    }

    const unmet = task.dependencyCodes.filter((code) => {
      const dependency = tasks.find((candidate) => candidate.code === code);
      return dependency ? dependency.status !== "COMPLETED" : false;
    });
    if (unmet.length > 0) {
      items.push({ ...base, bucket: "OBLIGATORIO", reason: `Depende de: ${unmet.join(", ")}` });
      continue;
    }
    if (task.status === "WAITING_USER") {
      items.push({ ...base, bucket: "BLOQUEADOR", reason: "Necesitamos que aportes información o documentación." });
      continue;
    }

    items.push({
      ...base,
      bucket: task.priority >= 110 ? "OPCIONAL" : "OBLIGATORIO",
      reason: task.status === "READY" ? "Lista para ejecutarse." : "Prevista en el itinerario.",
    });
  }

  const buckets = EMPTY_BUCKETS();
  for (const item of items) buckets[item.bucket].push(item);

  const tracked = items.filter((item) => item.bucket !== "OPCIONAL").length;
  const percentComplete = tracked > 0 ? Math.round((buckets.COMPLETADO.length / tracked) * 100) : 0;
  const nextBestAction = buckets.BLOQUEADOR[0] ?? buckets.OBLIGATORIO[0] ?? buckets.RECOMENDADO[0] ?? null;

  return {
    items,
    buckets,
    percentComplete,
    blockedCount: buckets.BLOQUEADOR.length,
    nextBestAction,
    nextQuestion: nextQuestionFor(nextBestAction),
  };
}

/** Una sola pregunta, la que más desbloquea. Nunca una batería. */
function nextQuestionFor(target: CompletenessItem | null): string | null {
  if (!target) return null;
  if (target.code.startsWith("FIELD_")) {
    return `Para seguir necesito un dato: ${target.label.toLowerCase()}.`;
  }
  return `El siguiente paso es «${target.label}». ${target.reason}`;
}
