import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/types/domain";
import { db, isDatabaseConfigured } from "@/lib/db";
import { isEncryptionConfigured } from "@/lib/documents/encryption";
import {
  NoEvidenceAttachedError,
  confirmTaskWithEvidence,
  linkDocumentToTasks,
  readTaskDocuments,
} from "@/lib/documents/evidence-repository";
import { storeDocument } from "@/lib/documents/repository";
import { listTasks, syncTasks } from "@/lib/task-repository";

/**
 * El ciclo completo contra PostgreSQL real: sube un papel, mira que mueva el
 * trámite, comprueba que NO lo dé por hecho, y cierra el trámite dejando la
 * evidencia guardada.
 */
const enabled = isDatabaseConfigured() && isEncryptionConfigured();
const suite = enabled ? describe : describe.skip;

const TITULAR: Actor = {
  userId: "test-evidencia-titular",
  email: "evidencia@example.test",
  name: "Titular de la prueba",
  mode: "oauth",
};

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), randomBytes(2048)]);

let projectId = "";

suite("del archivo al itinerario", () => {
  beforeAll(async () => {
    const { ensureActorWorkspace } = await import("@/lib/repository");
    const { userId, workspaceId } = await ensureActorWorkspace(TITULAR);
    const sql = db();
    const [fila] = await sql<Array<{ id: string }>>`
      insert into business_projects (workspace_id, name, business_description, preferred_legal_form, created_by)
      values (${workspaceId}, ${"Evidencia · SL de prueba"}, ${"Reformas"}, 'SL', ${userId})
      returning id
    `;
    projectId = fila.id;
    await syncTasks(TITULAR, projectId);
  });

  afterAll(async () => {
    const sql = db();
    await sql`delete from business_projects where id = ${projectId}`;
  });

  it("sin documento no se puede dar por hecho", async () => {
    await expect(
      confirmTaskWithEvidence({ actor: TITULAR, projectId, taskCode: "NOTARY" }),
    ).rejects.toThrow(NoEvidenceAttachedError);
  });

  it("la escritura mueve el trámite, pero no lo cierra", async () => {
    const { document } = await storeDocument({
      actor: TITULAR,
      projectId,
      category: "NOTARY",
      displayName: "escritura.pdf",
      mimeType: "application/pdf",
      bytes: PDF,
    });

    const efectos = await linkDocumentToTasks({
      actor: TITULAR,
      projectId,
      document: {
        id: document.id,
        category: "NOTARY",
        displayName: document.displayName,
        contentHash: document.contentHash,
      },
    });
    expect(efectos.map((e) => e.taskCode)).toContain("NOTARY");

    const tareas = await listTasks(TITULAR, projectId);
    const notaria = tareas.find((t) => t.code === "NOTARY");
    expect(notaria?.status).toBe("IN_PROGRESS");
    // Lo importante: nada quedó dado por hecho por sí solo.
    expect(tareas.filter((t) => t.status === "COMPLETED")).toHaveLength(0);
  });

  it("el documento queda enlazado al trámite", async () => {
    const porTarea = await readTaskDocuments(TITULAR, projectId);
    expect(porTarea.NOTARY?.[0]?.displayName).toBe("escritura.pdf");
  });

  it("al confirmar queda hecho y con la evidencia guardada", async () => {
    const { evidence } = await confirmTaskWithEvidence({ actor: TITULAR, projectId, taskCode: "NOTARY" });
    expect(evidence).toContain("escritura.pdf");
    expect(evidence).toContain("sha256");

    const sql = db();
    const [fila] = await sql<Array<{ status: string; evidence: string | null; completed_at: Date | null }>>`
      select status, evidence, completed_at from tasks where project_id = ${projectId} and code = 'NOTARY'
    `;
    expect(fila.status).toBe("COMPLETED");
    expect(fila.evidence).toBe(evidence);
    expect(fila.completed_at).not.toBeNull();
  });

  it("un papel posterior no reabre el trámite ya cerrado", async () => {
    const otro = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), randomBytes(512)]);
    const { document } = await storeDocument({
      actor: TITULAR,
      projectId,
      category: "NOTARY",
      displayName: "escritura-bis.pdf",
      mimeType: "application/pdf",
      bytes: otro,
    });
    const efectos = await linkDocumentToTasks({
      actor: TITULAR,
      projectId,
      document: {
        id: document.id,
        category: "NOTARY",
        displayName: document.displayName,
        contentHash: document.contentHash,
      },
    });
    expect(efectos.map((e) => e.taskCode)).not.toContain("NOTARY");

    const tareas = await listTasks(TITULAR, projectId);
    expect(tareas.find((t) => t.code === "NOTARY")?.status).toBe("COMPLETED");
  });

  it("lo que depende de un tercero queda esperando, no hecho", async () => {
    const nota = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), randomBytes(600)]);
    const { document } = await storeDocument({
      actor: TITULAR,
      projectId,
      category: "REGISTRY",
      displayName: "presentacion-registro.pdf",
      mimeType: "application/pdf",
      bytes: nota,
    });
    await linkDocumentToTasks({
      actor: TITULAR,
      projectId,
      document: {
        id: document.id,
        category: "REGISTRY",
        displayName: document.displayName,
        contentHash: document.contentHash,
      },
    });
    const tareas = await listTasks(TITULAR, projectId);
    expect(tareas.find((t) => t.code === "REGISTRY")?.status).toBe("WAITING_AUTHORITY");
  });

  it("la traza registra qué documento acreditó qué trámite, sin el contenido", async () => {
    const sql = db();
    const eventos = await sql<Array<{ payload: Record<string, unknown> }>>`
      select payload from case_events
      where project_id = ${projectId} and event_type = 'TASK_EVIDENCE_ATTACHED'
    `;
    expect(eventos.length).toBeGreaterThan(0);
    for (const evento of eventos) {
      const texto = JSON.stringify(evento.payload);
      expect(texto).not.toContain("%PDF");
      expect(Array.isArray(evento.payload.taskCodes)).toBe(true);
    }
  });
});
