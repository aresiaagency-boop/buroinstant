import { db } from "@/lib/db";
import { assertProjectAccess } from "@/lib/task-repository";
import type { Actor } from "@/types/domain";

/**
 * Las denominaciones que se piden al Registro Mercantil Central.
 *
 * El RMC admite hasta cinco por solicitud, por orden de preferencia, y concede
 * la primera que esté libre. De ahí las dos cosas que guarda esto: el orden y
 * cuál se concedió.
 *
 * Tres reglas, y las tres son de no inventar:
 *
 *   1. **No se corrige el nombre que escribe la persona.** Ni se le añade la
 *      forma social, ni se le quitan los puntos, ni se pone en mayúsculas. Las
 *      reglas de composición las aplica el RMC y su criterio es el que manda;
 *      «arreglar» un nombre aquí haría que se pidiera otro distinto del que se
 *      quería.
 *   2. **Concedida no es disponible.** Un candidato en `PROPOSED` no significa
 *      que el nombre esté libre: significa que se va a pedir. Sólo la
 *      certificación emitida acredita nada.
 *   3. **La fecha de expedición no se deduce.** Los tres meses para firmar y los
 *      seis de reserva cuelgan de ella; sin esa fecha en el expediente no se
 *      calcula ningún plazo, y la carpeta lo dice en vez de estimarlo.
 */

export const MAX_DENOMINACIONES = 5;

export const DENOMINATION_STATUSES = ["PROPOSED", "GRANTED", "REJECTED"] as const;
export type DenominationStatus = (typeof DENOMINATION_STATUSES)[number];

export type Denominacion = {
  position: number;
  name: string;
  status: DenominationStatus;
};

export class TooManyDenominationsError extends Error {
  constructor() {
    super("TOO_MANY_DENOMINATIONS");
    this.name = "TooManyDenominationsError";
  }
}

export class DuplicateDenominationError extends Error {
  constructor() {
    super("DUPLICATE_DENOMINATION");
    this.name = "DuplicateDenominationError";
  }
}

export class TooManyGrantedError extends Error {
  constructor() {
    super("TOO_MANY_GRANTED");
    this.name = "TooManyGrantedError";
  }
}

/** Normaliza sólo para comparar duplicados. Nunca se guarda así. */
function paraComparar(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function readDenominations(actor: Actor, projectId: string): Promise<Denominacion[]> {
  await assertProjectAccess(actor, projectId);
  const sql = db();
  const rows = await sql<Array<{ position: number; name: string; status: DenominationStatus }>>`
    select position, name, status
    from denomination_candidates
    where project_id = ${projectId}
    order by position asc
  `;
  return rows.map((row) => ({ position: Number(row.position), name: row.name, status: row.status }));
}

/**
 * Reemplaza la lista entera.
 *
 * Se repone en vez de parchear porque lo que importa es el orden relativo: mover
 * la tercera al primer puesto es un cambio de la lista, no de una fila. Una
 * lista vacía borra las que hubiera, que es como se descarta una solicitud
 * entera antes de enviarla.
 */
export async function saveDenominations(input: {
  actor: Actor;
  projectId: string;
  denominaciones: Array<{ name: string; status?: DenominationStatus }>;
}): Promise<Denominacion[]> {
  const { userId, workspaceId } = await assertProjectAccess(input.actor, input.projectId);

  const limpias = input.denominaciones
    .map((item) => ({ name: item.name.trim(), status: item.status ?? ("PROPOSED" as DenominationStatus) }))
    .filter((item) => item.name.length > 0);

  if (limpias.length > MAX_DENOMINACIONES) throw new TooManyDenominationsError();

  const vistas = new Set<string>();
  for (const item of limpias) {
    const clave = paraComparar(item.name);
    if (vistas.has(clave)) throw new DuplicateDenominationError();
    vistas.add(clave);
  }

  // El RMC concede una. Dos concedidas a la vez no describen ninguna realidad.
  if (limpias.filter((item) => item.status === "GRANTED").length > 1) throw new TooManyGrantedError();

  const sql = db();
  await sql.begin(async (tx) => {
    await tx`delete from denomination_candidates where project_id = ${input.projectId}`;
    for (const [indice, item] of limpias.entries()) {
      await tx`
        insert into denomination_candidates
          (workspace_id, project_id, position, name, status, created_by)
        values (
          ${workspaceId}, ${input.projectId}, ${indice + 1},
          ${item.name}, ${item.status}, ${userId}
        )
      `;
    }
  });

  return limpias.map((item, indice) => ({ position: indice + 1, name: item.name, status: item.status }));
}

/** La concedida, si ya hay una. */
export function concedida(denominaciones: Denominacion[]): Denominacion | undefined {
  return denominaciones.find((item) => item.status === "GRANTED");
}

export type PlazosDenominacion = {
  /** Fecha de expedición de la certificación, tal como consta en el expediente. */
  expedidaEl: string;
  /** Último día para otorgar la escritura: tres meses desde la expedición. */
  limiteEscritura: string;
  /** Último día de reserva de la denominación: seis meses desde la expedición. */
  limiteReserva: string;
};

function sumarMeses(isoDate: string, meses: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const total = month - 1 + meses;
  const anoDestino = year + Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anoDestino, mesDestino, 0)).getUTCDate();
  const diaDestino = Math.min(day, ultimo);
  return `${anoDestino}-${String(mesDestino).padStart(2, "0")}-${String(diaDestino).padStart(2, "0")}`;
}

/**
 * Los dos plazos que cuelgan de la certificación, que se confunden entre sí.
 *
 * Tres meses valen para otorgar la escritura; seis dura la reserva. Y ninguno
 * basta por separado: la certificación tiene que seguir vigente cuando se
 * PRESENTA en el Registro, no sólo cuando se firma ante notario.
 */
export function plazosDe(expedidaEl: string | undefined | null): PlazosDenominacion | null {
  if (!expedidaEl || !/^\d{4}-\d{2}-\d{2}$/.test(expedidaEl)) return null;
  return {
    expedidaEl,
    limiteEscritura: sumarMeses(expedidaEl, 3),
    limiteReserva: sumarMeses(expedidaEl, 6),
  };
}
